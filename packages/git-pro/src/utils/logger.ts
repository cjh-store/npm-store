import chalk from "chalk";

/** 日志工具类 */
export class Logger {
  /** 成功日志输出 */
  static success(message: string): void {
    console.log(chalk.green(`🟢 ${chalk.bgGreen.white(" 成功 ")} ${message}`));
  }

  /** 错误日志输出 */
  static error(message: string): void {
    console.error(chalk.red(`❌ ${chalk.bgRed.white(" 错误 ")} ${message}`));
  }

  /** 警告日志输出 */
  static warn(message: string): void {
    console.warn(
      chalk.yellow(`⚠️ ${chalk.bgYellow.black(" 警告 ")} ${message}`)
    );
  }

  /** 信息日志输出 */
  static info(message: string): void {
    console.info(chalk.blue(`🔊 ${chalk.bgBlue.white(" 信息 ")} ${message}`));
  }
}
