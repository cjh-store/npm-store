import { execSync } from "child_process";
import { Logger } from "../utils/logger";
import inquirer from "inquirer";

/**
 * 将当前分支合并到test分支并推送
 * @throws {Error} Git 命令执行失败时抛出错误
 */
export async function mergeTestCommand(): Promise<void> {
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

    // 检查test分支是否存在
    try {
      execSync("git rev-parse --verify test");
    } catch {
      Logger.error("test分支不存在");
      return;
    }

    // 合并前确认
    const { confirmMerge } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmMerge",
        message: `确认将 ${currentBranch} 合并到 test 分支?`,
        default: true,
      },
    ]);

    if (!confirmMerge) {
      Logger.info("已取消合并操作");
      return;
    }

    // 切换到test分支并更新
    Logger.info("切换到test分支...");
    execSync("git checkout test");
    execSync("git pull origin test");

    // 直接尝试合并，移除预先的冲突检测
    Logger.info(`合并 ${currentBranch} 到 test 分支...`);
    try {
      execSync(`git merge ${currentBranch}`);
    } catch (error: any) {
      Logger.error(`合并失败: ${error.message}`);
      // 如果发生冲突，提示用户手动处理
      if (error.message.includes("CONFLICT")) {
        Logger.error("发生合并冲突，请手动解决冲突后提交");
      }
      // 中止合并
      execSync("git merge --abort");
      return;
    }

    // 推送test分支
    Logger.info("推送test分支到远程...");
    try {
      execSync("git push origin test");
    } catch (error: any) {
      Logger.error(`推送失败: ${error.message}`);
      Logger.info("正在回滚合并...");
      execSync("git reset --hard HEAD^");
      // 切回原分支
      execSync(`git checkout ${currentBranch}`);
      return;
    }

    // 询问是否切回原分支
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

    Logger.success("合并完成!");
  } catch (error: any) {
    Logger.error(`操作失败: ${error.message}`);
    throw error;
  }
}
