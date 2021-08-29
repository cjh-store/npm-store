#!/usr/bin/env node
"use strict";
const chalk = require("chalk");
var dayjs = require("dayjs");

const Git = require("simple-git");
const GIT_PATH = __dirname;
const Bump = require("bump-regex");
const inquirer = require("inquirer");

let newVersion, //新标签
  versionHint; //新标签的备注
const promptList = [
  {
    type: "list",
    message: "请选择升级版本:",
    name: "type",
    choices: [
      {
        name: "主版本号：重大更新版本,为零时表示软件还在开发阶段",
        value: "major",
      },
      {
        name: "次版本号：表示功能更新,出现新功能时增加",
        value: "minor",
      },
      {
        name: "修订号：补丁更新版本,修复bug",
        value: "patch",
      },
      {
        name: "预发布：预发布版本,即将作为正式版发布",
        value: "prerelease",
      },
    ],
  },
];
function selectVersion() {
  inquirer
    .prompt(promptList)
    .then((res) => {
      addTag(res.type);
      // Use user feedback for... whatever!!
    })
    .catch((error) => {
      if (error.isTtyError) {
        // Prompt couldn't be rendered in the current environment
      } else {
        // Something else went wrong
      }
    });
}

function addTag(type) {
  Git(GIT_PATH)
    .pull()
    .tags(function (err, tags) {
      var oldVersion = tags.latest;
      oldVersion = oldVersion ? oldVersion.substr(1, oldVersion.length) : "";
      Bump(
        {
          str:
            "version:" + oldVersion
              ? oldVersion.substr(1, oldVersion.length)
              : "",
          type,
        },
        function (err, out) {
          //产生新代码
          newVersion = oldVersion ? "v" + out.new : "v1.0.0";
          //产生新标签的备注
          versionHint =
            "Relase version " +
            newVersion +
            " 发布于 " +
            dayjs().format("YYYY年MM月DD日  HH:mm:ss");

          Git(GIT_PATH).addAnnotatedTag(newVersion, versionHint, function () {
            Git(GIT_PATH).pushTags("origin", function () {
              console.log(
                "🔖 当前生成tag版本号为:",
                chalk.white.bgGreen.bold(newVersion)
              );
            });
          });
        }
      );
    });
}

selectVersion()