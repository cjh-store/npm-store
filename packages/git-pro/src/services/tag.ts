import simpleGit, { SimpleGit } from "simple-git";
import dayjs from "dayjs";
import inquirer from "inquirer";
import { Logger } from "../utils/logger";
import chalk from "chalk";

interface VersionBumpChoice {
  name: string;
  value: "major" | "minor" | "patch" | "prerelease";
  description?: string;
}

export class TagService {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  private parseVersion(version: string | null): string {
    if (!version) return "0.0.0";
    return version.length >= 13
      ? version.slice(1, version.lastIndexOf("."))
      : version.slice(1);
  }

  private generateNewVersion(currentVersion: string, type: string): string {
    const [major, minor, patch] = currentVersion.split(".").map(Number);

    switch (type) {
      case "major":
        return `${major + 1}.0.0`;
      case "minor":
        return `${major}.${minor + 1}.0`;
      case "patch":
        return `${major}.${minor}.${patch + 1}`;
      case "prerelease":
        return `${major}.${minor}.${patch}-rc.1`;
      default:
        return currentVersion;
    }
  }

  private async getVersionChoices(
    latestVersion: string
  ): Promise<VersionBumpChoice[]> {
    const choices: VersionBumpChoice[] = [
      {
        name: "主版本号：重大更新，第一次发布正式版",
        value: "major",
        description: this.generateNewVersion(latestVersion, "major"),
      },
      {
        name: "次版本号：功能更新，新功能发布",
        value: "minor",
        description: this.generateNewVersion(latestVersion, "minor"),
      },
      {
        name: "修订号：补丁更新，Bug修复",
        value: "patch",
        description: this.generateNewVersion(latestVersion, "patch"),
      },
      {
        name: "预发布：预发布版本，即将正式发布",
        value: "prerelease",
        description: this.generateNewVersion(latestVersion, "prerelease"),
      },
    ];

    return choices.map((choice) => ({
      ...choice,
      name: `${choice.name} (${choice.description})`,
    }));
  }

  public async createTag(): Promise<void> {
    try {
      // 1. 先拉取最新代码
      Logger.info("🔄  正在拉取最新代码...");
      await this.git.pull();

      // 2. 获取所有标签
      Logger.info("🏷️   正在获取标签信息...");
      const { latest } = await this.git.tags();
      const latestVersion = this.parseVersion(latest || null);

      // 3. 选择版本类型
      const choices = await this.getVersionChoices(latestVersion);
      const { type } = await inquirer.prompt([
        {
          type: "list",
          name: "type",
          message: "📦  请选择要升级的版本类型:",
          choices,
        },
      ]);

      // 4. 输入标签描述
      const { description } = await inquirer.prompt([
        {
          type: "input",
          name: "description",
          message:
            "📝  请输入描述信息(只有迭代类型的tag必填,一般写任务表迭代名称):",
          validate: (input: string) => {
            return true;
          },
        },
      ]);

      // 5. 生成新版本号
      const newVersion = this.generateNewVersion(latestVersion, type);
      const tagVersion = `v${newVersion}.${dayjs().format("YYMMDD_HHmm")}`;
      const tagMessage = `🔖 ${description} `;

      // 6. 创建并推送标签
      Logger.info("📤  正在创建并推送标签...");
      if (tagMessage) await this.git.addAnnotatedTag(tagVersion, tagMessage);
      await this.git.pushTags("origin");

      // 7. 提示成功
      Logger.success(`🔖  新标签 ${chalk.bold(tagVersion)} 已创建并推送`);
      await this.copyToClipboard(tagVersion);

      // 8. 询问是否切换回develop分支
      const { switchBranch } = await inquirer.prompt([
        {
          type: "confirm",
          name: "switchBranch",
          message: "🔀  是否需要切换回develop分支?",
          default: true,
        },
      ]);

      if (switchBranch) {
        try {
          const branches = await this.git.branch();
          if (!branches.all.includes("develop")) {
            Logger.warn("⚠️ develop分支不存在，请检查分支名称是否正确");
            return;
          }

          await this.git.checkout("develop");
          Logger.success("✅ 已切换到develop分支");
        } catch (error) {
          Logger.error("❌ 切换分支失败，请手动切换分支");
        }
      }
    } catch (error) {
      Logger.error(`❌  创建标签失败: ${error}`);
      throw error;
    }
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      const { exec } = require("child_process");
      const iconv = require("iconv-lite");

      await new Promise<void>((resolve, reject) => {
        const clipProcess = exec("clip", (error: Error | null) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });

        clipProcess.stdin.end(iconv.encode(`版本号:${text}`, "gbk"));
      });

      Logger.success("📋  版本号已复制到剪贴板");
    } catch (error) {
      Logger.warn("⚠️  复制到剪贴板失败");
    }
  }
}

export const tagService = new TagService();
