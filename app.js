#!/usr/bin/env node

const {Program,Command,LovaClass} = require('lovacli');
const config = require('./settings/settings.js');

let program = new Program(config);

program.init(true);

// program.init(false).then(async ()=>{
// 	await program.execute('rundefault');
// });