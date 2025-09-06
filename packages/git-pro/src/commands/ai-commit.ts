import inquirer from "inquirer";
import { gitService } from "../services/git";
import { configService } from "../services/config";
import { aiService } from "../services/ai";
import { Logger } from "../utils/logger";
import simpleGit from "simple-git";

/**
 * AI 辅助提交命令
 * 使用 DeepSeek AI 生成提交信息并提交代码
 */
export async function aiCommitCommand(): Promise<void> {
  try {
    // 注意：即使没有配置文件也能使用AI提交功能
    // 检查配置文件，但仅作为提示，不阻止继续
    if (!configService.hasConfig()) {
      Logger.warn("未找到配置文件，将使用默认配置");
    }

    // 快速检查暂存文件数量，避免使用耗费性能的方法
    const git = simpleGit();
    const status = await git.status();
    const fileCount = status.staged.length;

    // 当文件数量超过阈值时，直接进入常规提交流程，跳过耗费性能的操作
    if (fileCount > 20) {
      Logger.warn(`检测到暂存文件数量(${fileCount})较多`);
      Logger.info("文件数量超过20个时，自动切换到常规提交流程");

      // 直接进入提交类型选择界面，跳过confirmCommit和其他耗费性能的方法
      await gitService.commitWithCz();
      return;
    }

    // 文件数量较少时，继续正常流程
    // 提交前确认
    const confirmed = await gitService.confirmCommit();
    if (!confirmed) {
      Logger.info("已取消提交");
      return;
    }

    // 让用户选择提交方式
    const { commitType } = await inquirer.prompt([
      {
        type: "list",
        name: "commitType",
        message: "请选择提交方式:",
        choices: [
          { name: "AI辅助提交（自动生成提交信息）", value: "ai" },
          { name: "常规提交（手动选择提交类型）", value: "conventional" },
        ],
        default: "ai",
      },
    ]);

    // 用户选择了常规提交方式
    if (commitType === "conventional") {
      Logger.info("使用常规提交流程...");
      await gitService.commitWithCz();
      return;
    }


    try {
      // 通过 AI 生成提交信息
      const aiCommitMessage = await aiService.generateCommitMessage();

      // 格式化完整预览
      let formattedMessage = `${aiCommitMessage.type}`;
      if (aiCommitMessage.scope) {
        formattedMessage += `(${aiCommitMessage.scope})`;
      }
      formattedMessage += `: ${aiCommitMessage.subject}`;

      if (aiCommitMessage.body) {
        formattedMessage += `\n\n${aiCommitMessage.body}`;
      }

      // 显示 AI 生成的提交信息预览
      console.log("\nAI 生成的提交信息预览:");
      console.log("----------------------------------");
      console.log(formattedMessage);
      console.log("----------------------------------");

      // 让用户确认或编辑 AI 生成的提交信息
      const { useAiMessage } = await inquirer.prompt([
        {
          type: "confirm",
          name: "useAiMessage",
          message: "是否使用 AI 生成的提交信息?",
          default: true,
        },
      ]);

      // 如果用户同意使用 AI 生成的信息，执行提交
      if (useAiMessage) {
        await gitService.commitWithMessage({
          type: aiCommitMessage.type,
          scope: aiCommitMessage.scope,
          subject: aiCommitMessage.subject,
          body: aiCommitMessage.body,
        });
        Logger.success("AI 辅助提交成功！");
      } else {
        // 用户不使用 AI 生成的信息，回退到传统的提交流程
        Logger.info("将使用传统提交流程...");
        await gitService.commitWithCz();
      }
    } catch (error: any) {
      Logger.error("AI 生成提交信息失败: " + error.message);
      Logger.info("将回退到传统提交流程...");

      // AI 失败，回退到传统的提交流程
      await gitService.commitWithCz();
    }
  } catch (error: any) {
    Logger.error("提交失败：" + error.message);
    process.exit(1);
  }
}
