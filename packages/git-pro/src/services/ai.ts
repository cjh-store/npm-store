import axios from "axios";
import { Logger } from "../utils/logger";
import { gitService } from "./git";
import { configService } from "./config";
import fs from "fs";
import path from "path";

interface AIOptions {
  /** API 密钥 */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** 自定义提示词 */
  customPrompt?: string;
}

interface CzConfigForAI {
  types: Array<{
    value: string;
    name: string;
  }>;
  scopes?: string[];
  rawContent?: string;
}

/**
 * DeepSeek API 服务类
 */
export class AIService {
  private static instance: AIService;
  // 默认内置 API 密钥
  private apiKey: string = "c2stYzc3ZGE3MWJmYzc1NDYxNmJkN2M1NGJiMGY1ZTU0Y2E";
  private model: string = "deepseek-chat";
  private customPrompt: string = "";

  private constructor() {}

  /** 获取实例 */
  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /** 设置配置 */
  public setOptions(options: AIOptions): void {
    this.apiKey = options.apiKey || this.apiKey;
    this.model = options.model || "deepseek-chat";
    this.customPrompt = options.customPrompt || "";
  }

  /** 检查配置是否有效 */
  public isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * 从环境变量读取配置
   * 可以覆盖默认API密钥
   */
  public loadConfigFromEnv(): boolean {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const customPrompt = process.env.DEEPSEEK_PROMPT || "";

    if (apiKey) {
      this.setOptions({ apiKey, model, customPrompt });
      return true;
    }
    return false;
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
      // 尝试从环境变量加载配置（如果有的话）
      this.loadConfigFromEnv();

      // 已经有内置的默认 API 密钥，不再需要检查配置了

      // 获取暂存区差异
      const diffSummary = await gitService.getDiffSummaryForAI();

      // 获取 commitizen 配置
      const config = await this.getCzConfigForAI();

      // 构建提示词
      const prompt = this.buildPrompt(diffSummary, config);

      // 调用 API 生成提交信息
      const response = await this.callDeepSeekAPI(prompt);

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
    try {
      const configPath = configService.getConfigPath();

      // 如果找不到配置文件，使用默认配置
      if (!configPath) {
        return this.getDefaultCzConfig();
      }

      const absolutePath = path.resolve(configPath);
      delete require.cache[absolutePath];
      const config = require(absolutePath);

      // 读取原始配置文件内容
      const rawConfigContent = fs.readFileSync(absolutePath, "utf-8");

      return {
        types: config.types || [],
        scopes: config.scopes || [],
        rawContent: rawConfigContent, // 保存原始配置内容
      };
    } catch (error: any) {
      Logger.warn(`加载 commitizen 配置失败: ${error.message}`);
      return this.getDefaultCzConfig();
    }
  }

  /**
   * 提供默认的 commitizen 配置
   */
  private getDefaultCzConfig(): CzConfigForAI {
    return {
      types: [
        { value: "🎉 init", name: "🎉 init: 初始化" },
        { value: "✨ feat", name: "✨ feat: 新功能" },
        { value: "🐞 fix", name: "🐞 fix: 修复bug" },
        { value: "💡 perf", name: "💡 perf: 改进优化相关,比如提升性能、体验" },
        { value: "🚧 wip", name: "🚧 wip: 正在进行中的工作" },
        { value: "🚨 test", name: "🚨 test: 测试，实验" },
        { value: "🔧 chore", name: "🔧 chore: 构建/工程依赖/工具" },
        {
          value: "💄 style",
          name: "💄 style: 代码的样式美化(标记、空白、格式化、缺少分号……)",
        },
        { value: "🔖 release", name: "🔖 release: 发布版本" },
        { value: "🚚 move", name: "🚚 move: 移动或删除文件" },
        { value: "⏪ revert", name: "⏪ revert: 回退" },
        { value: "🔀 merge", name: "🔀 merge: 合并分支" },
        { value: "📝 docs", name: "📝 docs: 文档变更" },
      ],
      scopes: ["项目", ""], // 项目模块名可写在这里 方便快捷选择
    };
  }

  /**
   * 构建提示词
   */
  private buildPrompt(diffSummary: string, config: CzConfigForAI): string {
    // 基本提示词
    let prompt = `
作为一个 Git 提交消息生成器，请根据以下代码更改生成一条符合 Angular Commit Message 规范的提交消息,并结合获取的配置文件和git 提交信息的 emoji 指南,需要给type设置emoji表情。

代码更改摘要:
${diffSummary}

提交类型必须从以下选项中选择:
${config.types.map((t) => `- ${t.value}: ${t.name}`).join("\n")}

${
  config.scopes && config.scopes.length > 0
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

请只返回格式为 JSON 的结果，包含以下字段:
{
  "type": "带emoji的提交类型",
  "scope": "作用域(可选)",
  "subject": "简短描述",
  "body": "详细描述(可选)"
}
`;

    // 添加自定义提示词
    if (this.customPrompt) {
      prompt += `\n额外说明: ${this.customPrompt}`;
    }

    return prompt;
  }

  /**
   * 调用 DeepSeek API
   */
  private async callDeepSeekAPI(prompt: string): Promise<string> {
    try {
      const url = "https://api.deepseek.com/v1/chat/completions";
      // 解码 API 密钥
      const decodedApiKey = Buffer.from(this.apiKey, "base64").toString();

      const response = await axios.post(
        url,
        {
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 1000,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${decodedApiKey}`,
          },
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

      // 验证提交类型是否有效
      const validTypes = config.types.map((t) => t.value);
      if (!validTypes.includes(result.type)) {
        Logger.warn(
          `AI 生成的提交类型 "${result.type}" 不在允许的类型列表中，将使用默认类型 "feat"`
        );
        result.type = "feat";
      }

      return {
        type: result.type,
        scope: result.scope || undefined,
        subject: result.subject || "更新代码",
        body: result.body || undefined,
      };
    } catch (error) {
      Logger.error("解析 AI 响应失败，将使用默认提交信息");
      return {
        type: "feat",
        subject: "更新代码",
      };
    }
  }
}

export const aiService = AIService.getInstance();
