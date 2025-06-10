import { existsSync } from "fs";
import { join } from "path";
import { Logger } from "../utils/logger";

export class ConfigService {
  private static instance: ConfigService;

  private constructor() {}

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * 检查配置文件是否存在
   */
  public hasConfig(): boolean {
    const projectRoot = process.cwd();
    return (
      existsSync(join(projectRoot, ".cz-config.cjs")) ||
      existsSync(join(projectRoot, ".cz-config.js"))
    );
  }

  /**
   * 获取配置文件路径
   */
  public getConfigPath(): string | null {
    const projectRoot = process.cwd();
    const cjsPath = join(projectRoot, ".cz-config.cjs");
    const jsPath = join(projectRoot, ".cz-config.js");

    if (existsSync(cjsPath)) {
      return cjsPath;
    }

    if (existsSync(jsPath)) {
      return jsPath;
    }

    return null;
  }

  /**
   * 检查和提示配置状态
   * 返回是否有配置文件，但不阻止继续执行
   */
  public checkConfig(): boolean {
    if (!this.hasConfig()) {
      Logger.warn("未找到配置文件，将使用默认配置");
      return true; // 即使没有配置文件也返回 true，表示可以继续
    }
    return true;
  }
}

export const configService = ConfigService.getInstance();
