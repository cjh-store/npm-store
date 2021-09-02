#!/usr/bin/env node
"use strict";
const chalk = require("chalk");
var dayjs = require("dayjs");

const Git = require("simple-git");
const GIT_PATH = __dirname;
const Bump = require("bump-regex");
const inquirer = require("inquirer");

let newVersion,//新标签
    oldVersion,
    promptList, 
  versionHint; //新标签的备注

  promptList = [
    {
      type: "list",
      message: "请选择升级版本:",
      name: "type",
      choices: [
        {
          name: `主版本号：重大更新版本,第一次发布正式版选这个`,
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

function selectTag() {
  Git(GIT_PATH)
    .pull()
    .tags(function (err, tags) {
      
      oldVersion = tags.latest;
      if(oldVersion){
        oldVersion.length>=13?oldVersion.slice(1,oldVersion.lastIndexOf('.')):oldVersion.substr(1, oldVersion.length)
      }
      promptList[0].choices.forEach( (e,i)=>{
        Bump(
          {
            str:
              "version:" + oldVersion ,
            type:e.value,
          },
          function (err, out) {
            //产生新代码
           let newTag =  `v${out.new}.${dayjs().format('YYMMDD')}`
           if(i==0||i==1){
            e.name=`${e.name.slice(0,4)}(${out.new})${e.name.slice(4)}`
           }else{
            e.name=`${e.name.slice(0,3)}(${out.new})${e.name.slice(3)}`
           }
          }
        );
      })
      selectVersion()
    });
}

function addTag(type){
  Bump(
    {
      str:
        "version:" + oldVersion,
      type,
    },
    function (err, out) {
      //产生新代码
      newVersion =  `v${out.new}.${dayjs().format('YYMMDD')}`
     // 产生新标签的备注
      versionHint =
        "Relase version " +
        newVersion +
        " 发布于 " +
        dayjs().format("YYYY年MM月DD日  HH:mm:ss");

      Git(GIT_PATH).addAnnotatedTag(newVersion, versionHint, function () {
        Git(GIT_PATH).pushTags("origin", function () {
          console.log(
            "🔖 当前生成tag版本号为:",
            chalk.white.bgBlue.bold(' '+newVersion+' ') 
          );
        });
      });
    }
  );
}

selectTag()