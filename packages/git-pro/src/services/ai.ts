import axios from "axios";
import { Logger } from "../utils/logger";
import { gitService } from "./git";

interface CzConfigForAI {
  types: Array<{
    value: string;
    name: string;
  }>;
  scopes?: string[];
  rawContent?: string;
}

interface AIConfig {
  api: {
    baseUrl: string;
    defaultApiKey: string;
    timeout?: number;
  };
  model: {
    default: string;
  };
  prompt: {
    systemPrompt: string;
    customPrompt: string;
    outputFormat: {
      instruction: string;
      example: Record<string, string>;
    };
  };
  defaultTypes: Array<{ value: string; name: string }>;
  defaultScopes: string[];
  fallback: {
    type: string;
    subject: string;
  };
  messages: {
    modelInfo: string;
    success: string;
    parseError: string;
    typeWarning: string;
  };
}

/**
 * SiliconFlow API 服务类 (使用 GLM-4.5 模型)
 */
export class AIService {
  private static instance: AIService;
  private apiKey: string = "";
  private model: string = "";
  private customPrompt: string = "";
  private config: AIConfig | null = null;
  private readonly configUrl: string = "https://zfile.nmyh.cc/directlink/1/git-pro/ai-config.json";

  private constructor() { }

  /** 获取实例 */
  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /** 从远程加载配置 */
  private async loadRemoteConfig(): Promise<void> {
    try {
      const response = await axios.get(this.configUrl, {
        timeout: 10000
      });
      this.config = response.data;
      this.applyConfig();
      Logger.info("☁️ 已加载远程 AI 配置");
    } catch (error: any) {
      throw new Error(`❌ 无法加载远程配置: ${error.message}\n请确保配置服务器 ${this.configUrl} 可访问`);
    }
  }

  /** 应用配置 */
  private applyConfig(): void {
    if (!this.config) return;

    if (!this.apiKey) {
      this.apiKey = this.config.api.defaultApiKey;
    }
    if (!this.model) {
      this.model = this.config.model.default;
    }
    if (!this.customPrompt) {
      this.customPrompt = this.config.prompt.customPrompt;
    }
  }

  /**
   * 从环境变量读取配置
   */
  private async loadConfigFromEnv(): Promise<void> {
    // 先加载远程配置
    await this.loadRemoteConfig();

    // 环境变量配置优先级最高，可覆盖远程配置
    const apiKey = process.env.SILICONFLOW_API_KEY;
    const model = process.env.AI_MODEL;
    const customPrompt = process.env.AI_PROMPT;

    if (apiKey) this.apiKey = apiKey;
    if (model) this.model = model;
    if (customPrompt) this.customPrompt = customPrompt;
  }

  /**
   * 读取提交差异和配置，生成提交信息
   */
  public async generateCommitMessage(): Promise<{
    type: string;
    scope?: string;
    subject: string;
    body?: string;
  }> {
    try {
      // 加载远程配置和环境变量配置
      await this.loadConfigFromEnv();

      // 检查配置是否成功加载
      if (!this.config || !this.apiKey) {
        throw new Error("❌ AI 配置未成功加载，请检查配置服务器是否可访问");
      }

      // 获取暂存区差异
      const diffSummary = await gitService.getDiffSummaryForAI();

      // 获取 commitizen 配置
      const config = await this.getCzConfigForAI();

      // 构建提示词
      const prompt = this.buildPrompt(diffSummary, config);

      // 显示正在使用的模型
      if (this.config) {
        const modelMsg = this.config.messages.modelInfo.replace("{model}", this.model);
        Logger.info(modelMsg);
      }

      // 调用 API 生成提交信息
      const response = await this.callDeepSeekAPI(prompt);

      if (this.config) {
        const successMsg = this.config.messages.success.replace("{model}", this.model);
        Logger.info(successMsg);
      }

      // 解析返回的提交信息
      return this.parseResponse(response, config);
    } catch (error: any) {
      Logger.error(`AI 生成提交信息失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取 commitizen 配置供 AI 使用
   */
  private async getCzConfigForAI(): Promise<CzConfigForAI> {
    // 直接使用远程配置中的默认类型和作用域
    if (!this.config) {
      throw new Error("❌ 配置未加载，无法获取 commitizen 配置");
    }
    return {
      types: this.config.defaultTypes,
      scopes: this.config.defaultScopes,
    };
  }

  /**
   * 提供默认的 commitizen 配置
   */
  private getDefaultCzConfig(): CzConfigForAI {
    if (!this.config) {
      throw new Error("❌ 配置未加载，无法获取 commitizen 配置");
    }
    return {
      types: this.config.defaultTypes,
      scopes: this.config.defaultScopes,
    };
  }

  /**
   * 构建提示词
   */
  private buildPrompt(diffSummary: string, config: CzConfigForAI): string {
    if (!this.config) {
      throw new Error("❌ 配置未加载，无法构建提示词");
    }
    const systemPrompt = this.config.prompt.systemPrompt;

    // 基本提示词
    let prompt = `
${systemPrompt}

代码更改摘要:
${diffSummary}

提交类型必须从以下选项中选择（请直接使用列表中的值，不要添加冒号）:
${config.types.map((t) => `- ${t.value}: ${t.name}`).join("\n")}

${config.scopes && config.scopes.length > 0
        ? `可选的作用域范围:
${config.scopes.map((s) => `- ${s}`).join("\n")}`
        : ""
      }

`;

    // 添加原始配置文件内容（如果有）
    if (config.rawContent) {
      prompt += `
项目使用了以下 commitizen 配置文件:
\`\`\`javascript
${config.rawContent}
\`\`\`
`;
    }

    prompt += `
请生成符合以下格式的提交消息:
- 类型: 必须是上面列出的类型之一，确保类型前有适当的emoji表情
- 作用域: 请选择一个合适的作用域(可选)
- 简短描述: 用一句话描述变更内容(不超过100字符)
- 详细描述: 提供更详细的变更说明(可选)

请确保提交类型(type)包含emoji表情，以使提交信息在Git历史中更加直观。

${this.config.prompt.outputFormat.instruction}
${JSON.stringify(this.config.prompt.outputFormat.example, null, 2)}
`;

    // 添加自定义提示词
    if (this.customPrompt) {
      prompt += `\n额外说明: ${this.customPrompt}`;
    }

    return prompt;
  }

  /**
   * 调用 SiliconFlow API (GLM-4.5模型)
   */
  private async callDeepSeekAPI(prompt: string): Promise<string> {
    if (!this.config) {
      throw new Error("❌ 配置未加载，无法调用 API");
    }
    try {
      const url = this.config.api.baseUrl;
      // 直接使用API密钥，不需要解码
      const apiKey = this.apiKey;

      const response = await axios.post(
        url,
        {
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 2000,  // 增加到2000以支持更多代码提交
          enable_thinking: false,
          top_p: 0.7
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: this.config.api.timeout
        }
      );

      if (
        !response.data ||
        !response.data.choices ||
        !response.data.choices[0]
      ) {
        throw new Error("API 返回无效响应");
      }

      return response.data.choices[0].message.content;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `API 请求失败: ${error.response.status} - ${JSON.stringify(
            error.response.data
          )}`
        );
      }
      throw error;
    }
  }

  /**
   * 解析 API 响应
   */
  private parseResponse(
    response: string,
    config: CzConfigForAI
  ): {
    type: string;
    scope?: string;
    subject: string;
    body?: string;
  } {
    try {
      // 尝试提取 JSON 部分
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;

      const result = JSON.parse(jsonStr);

      // 去除 type 中可能存在的冒号
      if (result.type && result.type.includes(':')) {
        result.type = result.type.replace(':', '').trim();
      }

      // 验证提交类型是否有效
      const validTypes = config.types.map((t) => t.value);
      if (!validTypes.includes(result.type)) {
        if (this.config) {
          const warningMsg = this.config.messages.typeWarning.replace("{type}", result.type);
          Logger.warn(warningMsg);
          result.type = this.config.fallback.type;
        }
      }

      return {
        type: result.type,
        scope: result.scope || undefined,
        subject: result.subject || this.config?.fallback.subject,
        body: result.body || undefined,
      };
    } catch (error) {
      if (this.config) {
        Logger.error(this.config.messages.parseError);
        return {
          type: this.config.fallback.type,
          subject: this.config.fallback.subject,
        };
      }
      throw error;
    }
  }
}

export const aiService = AIService.getInstance();
