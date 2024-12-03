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
   */
  public checkConfig(): boolean {
    if (!this.hasConfig()) {
      Logger.error(
        "未找到配置文件，请确保项目根目录下存在 .cz-config.js 或 .cz-config.cjs"
      );
      Logger.info("您可以参考 cz-customizable 的文档来创建配置文件");
      return false;
    }
    return true;
  }
}

export const configService = ConfigService.getInstance();
