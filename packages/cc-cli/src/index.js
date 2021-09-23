#!/usr/bin/env node

const { program } = require('commander');
const create = require('../lib/init');
const onList = require('../lib/onList');
const onRun = require('../lib/onRun');



// 读取 packgaejson
const packageConfig = require('../package.json');
// 这样输出-V或--version就能看到版本号了
program.version(packageConfig.version);

// 初始化模板
program.command('init').description('初始化项目模板').action(create);

// 查看模板
program.command('ls').description('查看当前所有模板').action(onList);

// 运行命令
program.command('run').description('运行scripts命令').action(onRun);

program.parse(process.argv);
