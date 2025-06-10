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
      // 如果找不到配置文件，使用默认配置
      Logger.info("未找到配置文件，将使用默认配置");
      return this.getDefaultConfig();
    }

    try {
      const absolutePath = path.resolve(configPath);
      delete require.cache[absolutePath];
      this.config = require(absolutePath);
      return this.config as any;
    } catch (error) {
      Logger.warn(`加载配置文件失败: ${error}，将使用默认配置`);
      return this.getDefaultConfig();
    }
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): CzConfig {
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
      skipQuestions: ["body", "footer"],
      messages: {
        type: "选择一种你的提交类型( 必选 ❗):",
        scope:
          "请选择修改范围(支持自定义)\n 💬 业务项目中依据菜单或者功能模块划分(可选)：\n",
        customScope: "请输入自定义范围:",
        subject: "请简要描述提交( 必填 ❗)：\n",
        body: '请输入详细描述使用," | "换行(可选)：\n',
        breaking: "列出任何BREAKING CHANGES(可选)：\n",
        footer: "列出关闭的issue (可选):\n",
        confirmCommit: "确定提交此说明吗？",
      },
      allowCustomScopes: true,
      allowBreakingChanges: ["feat", "fix"], // 当提交类型为feat、fix时才有破坏性修改选项
      subjectLimit: 72,
    };
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
    // 使用 Set 来存储已处理的文件路径
    const processedFiles = new Set<string>();

    for (const file of status.staged) {
      // 如果文件已经处理过，则跳过
      if (processedFiles.has(file)) {
        continue;
      }

      try {
        const diff = await this.git.diff(["--cached", "--", file]);
        const changedLines = this.calculateFileChangedLines(diff);
        stagedFiles.push({
          path: file,
          status: await this.getFileStatus(file),
          diff,
          changedLines,
        });
        // 将文件标记为已处理
        processedFiles.add(file);
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

    // 检查是否是重命名文件
    const isRenamed = status.renamed.some((rename) => rename.to === file);
    if (isRenamed) return "renamed";

    // 根据文件在不同数组中的位置确定其最终状态
    if (status.created.includes(file)) return "new file";
    if (status.deleted.includes(file)) return "deleted";
    if (status.modified.includes(file)) return "modified";

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
   * 获取暂存文件信息（总文件数和总行数）
   */
  async getStagedFilesInfo(): Promise<{
    totalFiles: number;
    totalLines: number;
  }> {
    const stagedFiles = await this.getStagedFiles();
    let totalLines = 0;

    for (const file of stagedFiles) {
      totalLines += file.changedLines.additions + file.changedLines.deletions;
    }

    return {
      totalFiles: stagedFiles.length,
      totalLines,
    };
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
      colWidths: [30, 30, 30], // 设置每列的固定宽度
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

  /**
   * 获取用于 AI 生成提交信息的差异摘要
   */
  async getDiffSummaryForAI(): Promise<string> {
    try {
      // 获取暂存区文件
      const stagedFiles = await this.getStagedFiles();

      if (stagedFiles.length === 0) {
        throw new Error("没有暂存的更改，请先使用 git add 添加要提交的文件");
      }

      // 计算变更统计
      const stats = await this.calculateChangeStats(stagedFiles);

      // 组装差异摘要文本
      let summary = `变更概览：\n`;
      summary += `- 新增文件: ${stats.addedFiles.length} 个\n`;
      summary += `- 修改文件: ${stats.modifiedFiles.length} 个\n`;
      summary += `- 删除文件: ${stats.deletedFiles.length} 个\n`;
      summary += `- 重命名文件: ${stats.renamedFiles.length} 个\n`;
      summary += `- 总变更行数: ${stats.totalLines} 行\n\n`;

      // 添加文件类型信息
      summary += `文件类型：\n`;
      for (const [ext, count] of Object.entries(stats.fileTypes)) {
        summary += `- ${ext}: ${count} 个文件\n`;
      }
      summary += `\n`;

      // 添加最多 5 个文件的详细差异
      summary += `文件变更详情（最多展示 5 个重要文件）：\n`;

      // 按照变更行数排序并取前 5 个文件
      const importantFiles = [...stagedFiles]
        .sort((a, b) => {
          const linesA = a.changedLines.additions + a.changedLines.deletions;
          const linesB = b.changedLines.additions + b.changedLines.deletions;
          return linesB - linesA;
        })
        .slice(0, 5);

      for (const file of importantFiles) {
        summary += `\n文件: ${file.path} (${file.status})\n`;
        summary += `- 新增: +${file.changedLines.additions} 行\n`;
        summary += `- 删除: -${file.changedLines.deletions} 行\n`;

        // 添加文件差异的简短摘要
        if (file.diff) {
          // 限制差异内容长度
          const maxLength = 500;
          const diffContent =
            file.diff.length > maxLength
              ? file.diff.substring(0, maxLength) + "...(省略剩余内容)"
              : file.diff;

          summary += `差异内容:\n${diffContent}\n`;
        }
      }

      return summary;
    } catch (error: any) {
      Logger.error("获取差异摘要失败：" + error.message);
      throw error;
    }
  }

  /**
   * 使用指定的提交信息进行提交
   */
  async commitWithMessage(message: {
    type: string;
    scope?: string;
    subject: string;
    body?: string;
    breaking?: string;
    issues?: string;
  }): Promise<void> {
    try {
      const commitMessage = this.formatCommitMessage(message);
      await this.git.commit(commitMessage);
      Logger.success("提交成功！");
    } catch (error: any) {
      Logger.error("提交失败：" + error);
      throw error;
    }
  }
}

export const gitService = new GitService();
