import { execSync } from "child_process";
import { Logger } from "../utils/logger";

/**
 * 将当前分支合并到test分支并推送
 * @throws {Error} Git 命令执行失败时抛出错误
 */
export async function mergeTestCommand(): Promise<void> {
  try {
    // 保存当前分支名
    const currentBranch = execSync("git rev-parse --abbrev-ref HEAD")
      .toString()
      .trim();

    Logger.info(`当前分支: ${currentBranch}`);

    // 切换到test分支并更新
    Logger.info("切换到test分支...");
    execSync("git checkout test");
    execSync("git pull origin test");

    // 合并当前分支到test
    Logger.info(`合并 ${currentBranch} 到 test 分支...`);
    execSync(`git merge ${currentBranch}`);

    // 推送test分支
    Logger.info("推送test分支到远程...");
    execSync("git push origin test");

    // 切回原分支
    Logger.info(`切回 ${currentBranch} 分支...`);
    execSync(`git checkout ${currentBranch}`);

    Logger.success("合并完成!");
  } catch (error) {
    Logger.error(`合并失败: ${error.message}`);
    throw error;
  }
}
