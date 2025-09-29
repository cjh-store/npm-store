import axios from "axios";
import { Logger } from "../utils/logger";
import { gitService } from "./git";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface CzConfigForAI {
  types: Array<{
    value: string;
    name: string;
  }>;
  scopes?: string[];
  rawContent?: string;
}

interface CachedConfig {
  config: AIConfig;
  timestamp: number;
  version?: string;
  url: string;
}

interface AIConfig {
  api: {
    baseUrl: string;
    defaultApiKey: string;
    timeout?: number;
  };
  model: {
    default: string;
    parameters?: {
      // 所有API参数都可以通过此配置动态传入
      // 常用参数示例：
      enable_thinking?: boolean;
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
      frequency_penalty?: number;
      presence_penalty?: number;
      // 任何其他API参数都可以在这里添加，无需修改代码
      [key: string]: any;
    };
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
  private readonly cacheDir: string;
  private readonly cacheFilePath: string;

  private constructor() {
    // 初始化缓存目录路径
    this.cacheDir = path.join(os.homedir(), '.git-pro');
    this.cacheFilePath = path.join(this.cacheDir, 'ai-config-cache.json');
  }

  /** 获取实例 */
  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /** 确保缓存目录存在 */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /** 保存配置到缓存 */
  private saveConfigToCache(config: AIConfig): void {
    try {
      this.ensureCacheDir();
      const cachedConfig: CachedConfig = {
        config,
        timestamp: Date.now(),
        version: "1.0.0", // 可以根据需要从config中提取版本信息
        url: this.configUrl
      };
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(cachedConfig, null, 2));
      Logger.info("💾 已保存配置到本地缓存");
    } catch (error: any) {
      Logger.warn(`⚠️ 保存配置缓存失败: ${error.message}`);
    }
  }

  /** 从缓存读取配置 */
  private loadConfigFromCache(): AIConfig | null {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        return null;
      }

      const cacheContent = fs.readFileSync(this.cacheFilePath, 'utf-8');
      const cachedConfig: CachedConfig = JSON.parse(cacheContent);
      
      // 检查缓存是否过期（默认7天）
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天
      const isExpired = Date.now() - cachedConfig.timestamp > maxAge;
      
      if (isExpired) {
        Logger.warn("⏰ 缓存配置已过期，将尝试重新获取远程配置");
        return null;
      }

      Logger.info("📦 已从本地缓存加载配置");
      return cachedConfig.config;
    } catch (error: any) {
      Logger.warn(`⚠️ 读取配置缓存失败: ${error.message}`);
      return null;
    }
  }

  /** 从远程加载配置 */
  private async loadRemoteConfig(): Promise<void> {
    try {
      const response = await axios.get(this.configUrl, {
        timeout: 10000
      });
      this.config = response.data;
      
      // 保存到缓存
      this.saveConfigToCache(this.config);
      
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
   * 从环境变量读取配置（支持缓存回退）
   */
  private async loadConfigFromEnv(): Promise<void> {
    try {
      // 优先加载远程配置
      await this.loadRemoteConfig();
    } catch (error: any) {
      Logger.warn("☁️ 远程配置加载失败，尝试使用本地缓存");
      
      // 远程配置失败时，尝试从缓存加载
      const cachedConfig = this.loadConfigFromCache();
      
      if (cachedConfig) {
        this.config = cachedConfig;
        this.applyConfig();
        Logger.info("🔄 已使用本地缓存配置作为回退方案");
      } else {
        // 如果缓存也没有，抛出原始错误
        Logger.error("❌ 远程配置和本地缓存都不可用");
        throw error;
      }
    }

    // 环境变量配置优先级最高，可覆盖远程/缓存配置
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

      // 构建基础请求参数（核心参数，不可覆盖）
      const requestBody: any = {
        model: this.model,
        messages: [{ role: "user", content: prompt }]
      };

      // 设置默认参数
      const defaultParams = {
        temperature: 0.3,
        max_tokens: 2000,
        top_p: 0.7
      };

      // 从配置中获取模型参数
      const modelParams = this.config.model.parameters || {};

      // 合并参数：默认参数 + 配置参数（配置参数优先级更高）
      Object.assign(requestBody, defaultParams, modelParams);

      const response = await axios.post(
        url,
        requestBody,
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
