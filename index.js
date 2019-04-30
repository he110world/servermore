#!/usr/bin/env node
const path = require('path')
const url = require('url')
const fs = require('fs')

//parse arguments
const opt = require('optimist')
const argv =
opt
.usage('Server manager with built in CI support.\n\nUsage: sm [options] [target directory]')
.string('g').alias('g','git').describe('g','Git server URL')
.string('u').alias('u','username').describe('u','Git CI account username')
.string('p').alias('p','password').describe('p','Git CI account password')
.string('c').alias('c','config').alias('c','cfg').describe('c','Config json file')
.default('P',8080).alias('P','port').describe('P','Listening port')
.boolean('h').alias('h','help').describe('h','Show this help and exit')
.argv

if (argv.h) {
	console.log(opt.help())
	process.exit(0)
}

const ip = require('ip')
const ip_addr = ip.address()
const ip_port = `${ip_addr}:${argv.port}`

const opts = {
	port:	argv.port,
	dir:	path.resolve(String(argv._[0] || './')),
	git:	argv.g ? url.parse(argv.g) : null,
	username:	argv.username,
	password:	argv.password,
	git_hook:	`http://${ip_port}/hook/gogs/push`
}

//create target directory if not exist
const mkdirp = require('mkdirp')
mkdirp(opts.dir, err=>{if(err)console.log(err)})

const Koa = require('koa')
const Router = require('koa-router')
const app = new Koa()
const router = new Router()

const json = require('koa-json')
const onerror = require('koa-onerror')
const bodyparser = require('koa-bodyparser')
const logger = require('koa-logger')
const formidable = require('koa2-formidable')

const git = require('isomorphic-git')
git.plugins.set('fs',fs)

onerror(app)
app
.use(logger())
.use(formidable())
.use(bodyparser())
.use(json())
.use(router.routes())
.use(router.allowedMethods())

app.on('error', (err, ctx)=>{
	console.error('server error', err)
})

app.listen(opts.port, () => {
	const git_msg = opts.git ? `\nGit server: ${opts.git.href}\n` : ''
	const msg = 
`
Servermore-ci is up and running.
${git_msg}
Local repo: ${opts.dir}

Hook:
	http://${ip_port}/hook/gogs/push

Dashboard:
	http://${ip_port}/dashboard
`
	console.log(msg)
})

//后台
require('./lib/dashboard')(router, opts)
require('./lib/ci')(router, opts)
require('./lib/hook')(router, opts)
require('./lib/main')(router, opts)

