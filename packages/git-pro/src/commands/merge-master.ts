import { execSync } from "child_process";
import { Logger } from "../utils/logger";
import inquirer from "inquirer";
import { tagCommand } from "./tag";

/**
 * 将develop分支合并到master分支并创建tag
 * @throws {Error} Git命令执行失败时抛出错误
 */
export async function mergeMasterCommand(): Promise<void> {
  try {
    // 检查是否有未提交的更改
    const status = execSync("git status --porcelain").toString();
    if (status) {
      Logger.error("存在未提交的更改，请先提交或暂存更改");
      return;
    }

    // 保存当前分支名
    const currentBranch = execSync("git rev-parse --abbrev-ref HEAD")
      .toString()
      .trim();

    Logger.info(`当前分支: ${currentBranch}`);

    // 检查是否在develop分支
    if (currentBranch !== "develop") {
      const { switchToDevelop } = await inquirer.prompt([
        {
          type: "confirm",
          name: "switchToDevelop",
          message: "当前不在develop分支，是否切换到develop分支?",
          default: true,
        },
      ]);

      if (!switchToDevelop) {
        Logger.info("已取消操作");
        return;
      }

      // 切换到develop分支
      Logger.info("切换到develop分支...");
      execSync("git checkout develop");
    }

    // 更新develop分支
    Logger.info("更新develop分支...");
    execSync("git pull origin develop");

    // 检查master分支是否存在
    try {
      execSync("git rev-parse --verify master");
    } catch {
      Logger.error("master分支不存在");
      return;
    }

    // 切换到master分支并更新
    Logger.info("切换到master分支...");
    execSync("git checkout master");
    execSync("git pull origin master");

    // 合并develop到master
    Logger.info("合并develop到master分支...");
    try {
      execSync("git merge develop");
    } catch (error: any) {
      Logger.error(`合并失败: ${error.message}`);
      if (error.message.includes("CONFLICT")) {
        Logger.error("发生合并冲突，请手动解决冲突后提交");
      }
      // 中止合并
      execSync("git merge --abort");
      // 切回原分支
      execSync(`git checkout ${currentBranch}`);
      return;
    }

    // 推送master分支
    Logger.info("推送master分支到远程...");
    try {
      execSync("git push origin master");
    } catch (error: any) {
      Logger.error(`推送失败: ${error.message}`);
      Logger.info("正在回滚合并...");
      execSync("git reset --hard HEAD^");
      // 切回原分支
      execSync(`git checkout ${currentBranch}`);
      return;
    }

    // 调用tag命令
    Logger.info("开始创建tag...");
    await tagCommand();

    // 如果之前不是在develop分支，询问是否切回原分支
    if (currentBranch !== "develop") {
      const { shouldSwitch } = await inquirer.prompt([
        {
          type: "confirm",
          name: "shouldSwitch",
          message: `是否切回 ${currentBranch} 分支?`,
          default: true,
        },
      ]);

      if (shouldSwitch) {
        Logger.info(`切回 ${currentBranch} 分支...`);
        execSync(`git checkout ${currentBranch}`);
      }
    }

    Logger.success("合并完成!");
  } catch (error: any) {
    Logger.error(`操作失败: ${error.message}`);
    throw error;
  }
}
