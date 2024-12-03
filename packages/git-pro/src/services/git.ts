import simpleGit, { SimpleGit } from "simple-git";
import chalk from "chalk";
import { Logger } from "../utils/logger";
import inquirer from "inquirer";
import { configService } from "./config";
import path from "path";
import Table from "cli-table3";

interface FileChanges {
  additions: number;
  deletions: number;
}

interface StagedFile {
  path: string;
  status: string;
  diff?: string;
  changedLines: FileChanges;
}

interface CommitType {
  value: string;
  name: string;
}

interface CzConfig {
  types: CommitType[];
  messages: {
    type?: string;
    scope?: string;
    customScope?: string;
    subject?: string;
    body?: string;
    breaking?: string;
    footerPrefixes?: string;
    footer?: string;
    confirmCommit?: string;
  };
  scopes?: string[];
  allowCustomScopes?: boolean;
  allowBreakingChanges?: string[];
  breaklineChar?: string;
  skipQuestions?: string[];
  subjectLimit?: number;
}

interface ChangeStats {
  totalLines: number;
  addedFiles: StagedFile[];
  modifiedFiles: StagedFile[];
  deletedFiles: StagedFile[];
  renamedFiles: StagedFile[];
  fileTypes: Record<string, number>;
}

export class GitService {
  private git: SimpleGit;
  private config?: CzConfig;

  constructor() {
    this.git = simpleGit();
  }

  /**
   * 加载配置文件
   */
  private async loadConfig(): Promise<CzConfig> {
    if (this.config) return this.config;

    const configPath = configService.getConfigPath();
    if (!configPath) {
      throw new Error(
        "未找到配置文件，请确保项目根目录下存在 .cz-config.js 或 .cz-config.cjs"
      );
    }

    try {
      const absolutePath = path.resolve(configPath);
      delete require.cache[absolutePath];
      this.config = require(absolutePath);
      return this.config as any;
    } catch (error) {
      throw new Error(`加载配置文件失败: ${error}`);
    }
  }

  /**
   * 计算单个文件的新增和删除行数
   */
  private calculateFileChangedLines(diff: string): {
    additions: number;
    deletions: number;
  } {
    const lines = diff.split("\n");
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        additions++;
      }
      if (line.startsWith("-") && !line.startsWith("---")) {
        deletions++;
      }
    }

    return { additions, deletions };
  }

  /**
   * 获取暂存区文件详情
   */
  private async getStagedFiles(): Promise<StagedFile[]> {
    const status = await this.git.status();
    const stagedFiles: StagedFile[] = [];

    for (const file of status.staged) {
      let diff = "";
      try {
        diff = await this.git.diff(["--cached", "--", file]);
        const changedLines = this.calculateFileChangedLines(diff);
        stagedFiles.push({
          path: file,
          status: await this.getFileStatus(file),
          diff,
          changedLines,
        });
      } catch (error) {
        Logger.error(`无法获取文件 ${file} 的改动信息`);
      }
    }

    return stagedFiles;
  }

  /**
   * 获取文件状态描述
   */
  private async getFileStatus(file: string): Promise<string> {
    const status = await this.git.status();

    const renamedFiles = status.renamed.map((rename) => rename.to);
    if (renamedFiles.includes(file)) return "renamed";

    if (status.created.includes(file)) return "new file";
    if (status.modified.includes(file)) return "modified";
    if (status.deleted.includes(file)) return "deleted";
    return "changed";
  }

  /**
   * 计算文件改动统计
   */
  private async calculateChangeStats(
    stagedFiles: StagedFile[]
  ): Promise<ChangeStats> {
    const stats: ChangeStats = {
      totalLines: 0,
      addedFiles: [],
      modifiedFiles: [],
      deletedFiles: [],
      renamedFiles: [],
      fileTypes: {},
    };

    for (const file of stagedFiles) {
      stats.totalLines +=
        file.changedLines.additions + file.changedLines.deletions;

      const ext = path.extname(file.path) || "(无扩展名)";
      stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;

      switch (file.status) {
        case "new file":
          stats.addedFiles.push(file);
          break;
        case "modified":
          stats.modifiedFiles.push(file);
          break;
        case "deleted":
          stats.deletedFiles.push(file);
          break;
        case "renamed":
          stats.renamedFiles.push(file);
          break;
      }
    }

    return stats;
  }

  /**
   * 展示变更统计信息
   */
  private async displayChangeSummary(stats: ChangeStats): Promise<void> {
    const tableConfig = {
      chars: {
        top: "─",
        "top-mid": "┬",
        "top-left": "┌",
        "top-right": "┐",
        bottom: "─",
        "bottom-mid": "┴",
        "bottom-left": "└",
        "bottom-right": "┘",
        left: "│",
        "left-mid": "├",
        mid: "─",
        "mid-mid": "┼",
        right: "│",
        "right-mid": "┤",
        middle: "│",
      },
      style: {
        head: ["cyan"],
        border: ["grey"],
      },
      colWidths: [30, 15, 15], // 设置每列的固定宽度
      wordWrap: true,
    };

    const summaryTable = new Table({
      ...tableConfig,
      head: [
        chalk.blue("📝 文件改动"),
        chalk.blue("状态"),
        chalk.blue("改动统计"),
      ],
    });

    // 添加新增文件
    for (const file of stats.addedFiles) {
      const { additions, deletions } = file.changedLines;
      summaryTable.push([
        file.path,
        chalk.green("新文件"),
        `+${additions} -${deletions}`,
      ]);
    }

    // 添加修改文件
    for (const file of stats.modifiedFiles) {
      const { additions, deletions } = file.changedLines;
      summaryTable.push([
        file.path,
        chalk.yellow("已更新"),
        `+${additions} -${deletions}`,
      ]);
    }

    // 添加删除文件
    for (const file of stats.deletedFiles) {
      const { additions, deletions } = file.changedLines;
      summaryTable.push([
        file.path,
        chalk.red("已删除"),
        `+${additions} -${deletions}`,
      ]);
    }

    // 添加重命名文件
    for (const file of stats.renamedFiles) {
      const { additions, deletions } = file.changedLines;
      summaryTable.push([
        file.path,
        chalk.blue("已重命名"),
        `+${additions} -${deletions}`,
      ]);
    }

    // 添加总计统计
    if (stats.totalLines > 0) {
      const totalAdditions = [
        ...stats.addedFiles,
        ...stats.modifiedFiles,
        ...stats.renamedFiles,
      ].reduce((sum, file) => sum + file.changedLines.additions, 0);
      const totalDeletions = [
        ...stats.deletedFiles,
        ...stats.modifiedFiles,
        ...stats.renamedFiles,
      ].reduce((sum, file) => sum + file.changedLines.deletions, 0);

      summaryTable.push([
        chalk.cyan("总计改动"),
        chalk.cyan("📈"),
        chalk.cyan(`+${totalAdditions} -${totalDeletions}`),
      ]);
    }

    // 添加当前分支信息
    const currentBranch = await this.git.branch();
    summaryTable.push([
      chalk.magenta("请核对当前分支"),
      chalk.magenta("📌"),
      chalk.magenta(currentBranch.current),
    ]);

    console.log(summaryTable.toString());
  }

  /**
   * 提交前预览和确认
   */
  async confirmCommit(): Promise<boolean> {
    const stagedFiles = await this.getStagedFiles();

    if (stagedFiles.length === 0) {
      Logger.warn("暂存区没有文件");
      return false;
    }

    const stats = await this.calculateChangeStats(stagedFiles);
    await this.displayChangeSummary(stats);

    const { confirmed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmed",
        message: "确认提交以上改动？",
        default: true,
      },
    ]);

    return confirmed;
  }

  /**
   * 获取提交信息
   */
  private async getCommitMessage(): Promise<{
    type: string;
    scope?: string;
    subject: string;
    body?: string;
    breaking?: string;
    issues?: string;
  }> {
    const config = await this.loadConfig();

    // 提交类型
    const { type } = await inquirer.prompt([
      {
        type: "list",
        name: "type",
        message: config.messages.type || "选择提交类型:",
        choices: config.types,
      },
    ]);

    const questions = [];

    // Scope 处理
    if (!config.skipQuestions?.includes("scope")) {
      const scopeChoices = [];

      if (config.scopes && config.scopes.length > 0) {
        scopeChoices.push(
          ...config.scopes.map((scope) => ({
            name: scope,
            value: scope,
          }))
        );

        if (config.allowCustomScopes !== false) {
          scopeChoices.push({
            name: "自定义范围...",
            value: "custom",
          });
        }

        scopeChoices.push({
          name: "无范围",
          value: "",
        });

        questions.push({
          type: "list",
          name: "scopeSelection",
          message: config.messages.scope || "选择修改范围:",
          choices: scopeChoices,
        });

        questions.push({
          type: "input",
          name: "customScope",
          message: config.messages.customScope || "请输入自定义范围:",
          when: (answers: any) => answers.scopeSelection === "custom",
          validate: (input: string) => {
            if (!input.trim()) {
              return "范围不能为空";
            }
            return true;
          },
        });
      } else {
        questions.push({
          type: "input",
          name: "customScope",
          message: config.messages.scope || "输入修改范围 (可选):",
        });
      }
    }

    // Subject
    questions.push({
      type: "input",
      name: "subject",
      message: config.messages.subject || "输入简短描述:",
      validate: (input: string) => {
        if (input.length === 0) return "描述不能为空";
        if (config.subjectLimit && input.length > config.subjectLimit) {
          return `描述长度不能超过 ${config.subjectLimit} 个字符`;
        }
        return true;
      },
    });

    // Body
    if (!config.skipQuestions?.includes("body")) {
      questions.push({
        type: "input",
        name: "body",
        message: config.messages.body || "输入详细描述 (可选):",
      });
    }

    // Breaking Changes
    if (
      !config.skipQuestions?.includes("breaking") &&
      (!config.allowBreakingChanges ||
        config.allowBreakingChanges.includes(type))
    ) {
      questions.push({
        type: "input",
        name: "breaking",
        message: config.messages.breaking || "列出任何BREAKING CHANGES (可选):",
      });
    }

    // Issues
    if (!config.skipQuestions?.includes("footer")) {
      questions.push({
        type: "input",
        name: "issues",
        message: config.messages.footer || "列出关闭的issue (可选):",
      });
    }

    const answers = await inquirer.prompt(questions);

    let finalScope = "";
    if (answers.scopeSelection === "custom") {
      finalScope = answers.customScope;
    } else if (answers.scopeSelection !== undefined) {
      finalScope = answers.scopeSelection;
    } else {
      finalScope = answers.customScope || "";
    }

    // 最终确认
    if (config.messages.confirmCommit) {
      const message = this.formatCommitMessage({
        type,
        scope: finalScope,
        subject: answers.subject,
        body: answers.body,
        breaking: answers.breaking,
        issues: answers.issues,
      });

      console.log("\n提交信息预览:");
      console.log(chalk.green(message));

      const { confirmed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: config.messages.confirmCommit || "确认提交?",
          default: true,
        },
      ]);

      if (!confirmed) {
        throw new Error("用户取消提交");
      }
    }

    return {
      type,
      scope: finalScope,
      subject: answers.subject,
      body: answers.body,
      breaking: answers.breaking,
      issues: answers.issues,
    };
  }

  /**
   * 格式化提交信息
   */
  private formatCommitMessage(message: {
    type: string;
    scope?: string;
    subject: string;
    body?: string;
    breaking?: string;
    issues?: string;
  }): string {
    let commitMessage = `${message.type}`;

    if (message.scope) {
      commitMessage += `(${message.scope})`;
    }

    commitMessage += `: ${message.subject}`;

    if (message.body) {
      commitMessage += `\n\n${message.body}`;
    }

    if (message.breaking) {
      commitMessage += `\n\nBREAKING CHANGE: ${message.breaking}`;
    }

    if (message.issues) {
      commitMessage += `\n\n${message.issues}`;
    }

    return commitMessage;
  }

  /**
   * 执行提交
   */
  async commitWithCz(): Promise<void> {
    try {
      const message = await this.getCommitMessage();
      const commitMessage = this.formatCommitMessage(message);
      await this.git.commit(commitMessage);
      Logger.success("提交成功！");
    } catch (error: any) {
      if (error.message === "用户取消提交") {
        Logger.info("已取消提交");
        return;
      }
      Logger.error("提交失败：" + error);
      throw error;
    }
  }
}

export const gitService = new GitService();
