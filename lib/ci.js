const fs = require('fs')
const path = require('path')
const git = require('isomorphic-git')
const superagent = require('superagent')
const util = require('util')
const readdir = util.promisify(require('recursive-readdir'))
const npm = require('npm-programmatic')
const is_builtin_module = require('is-builtin-module')

const readdirAsync = util.promisify(fs.readdir)
const readFileAsync = util.promisify(fs.readFile)

function ignore_non_js(file,stats){
	return !stats.isDirectory() && !file.endsWith('.js')
}

const internal_list = []
async function get_modules(file_name){
	const source = await readFileAsync(file_name, 'utf8')

	//找到所有的require()调用
	const require_list = []
	const re = /[^\.]require\(([^)]*)\)/g

	let matches
	while(matches=re.exec(source)){
		const p = matches[1].replace(/['"]/g,'').trim()
		if (!p.startsWith('.') && !is_builtin_module(p) && require_list.indexOf(p)===-1) {
			require_list.push(p)
		}
	}
	return require_list
}

module.exports = (router, opts)=>{
      	async function check_cookie(ctx,next){
		const token = ctx.cookies.get('gogs-token')
		if (token) {
			await next()
		} else {
			ctx.redirect('/dashboard/login.html')
		}
	}

	async function get_json(ctx,api){
		const u = opts.git.resolve('/api/v1' + api)
		const token = ctx.cookies.get('gogs-token')
		const auth = `token ${token}`
		const res = await superagent.get(u).set('Authorization', auth)
		return res.body
	}

	async function put_json(ctx,api,payload){
		const u = opts.git.resolve('/api/v1' + api)
		const token = ctx.cookies.get('gogs-token')
		const auth = `token ${token}`
		let req = superagent.put(u).set('Authorization', auth)
		if (payload) {
			req = req.send(payload)
		}
		const res = await req
		return res.body
	}

	async function post_json(ctx,api,payload){
		const u = opts.git.resolve('/api/v1' + api)
		const token = ctx.cookies.get('gogs-token')
		const auth = `token ${token}`
		let req = superagent.post(u).set('Authorization', auth)
		if (payload) {
			req = req.send(payload)
		}
		const res = await req
		return res.body
	}

	function RepoOpts(full_name){
		this.dir = path.join(opts.dir, full_name)
		this.url = opts.git.href + full_name + '.git'
		this.username = opts.username
		this.password = opts.password
		this.depth = 1
	}

	router.post('/api/ci/login', async ctx=>{
		const token = ctx.request.body.token
		if (token) {
			const u = opts.git.resolve('/api/v1/user/repos')
			const auth = `token ${token}`
			try{
				const res = await superagent.get(u).set('Authorization', auth)
				ctx.cookies.set('gogs-token', token)
				ctx.redirect('/dashboard/index.html')
			}catch(e){
				ctx.status = 401
				ctx.redirect('/dashboard/login.html')
			}
		} else {
			ctx.status = 401
			ctx.redirect('/dashboard/login.html')
		}
	})

	router.use('/api', check_cookie)

	router.post('/api/ci/logout', async ctx=>{
		ctx.cookies.set('gogs-token','')
		ctx.redirect('/dashboard/login.html')
	})

      	router.post('/api/ci/repo/branches', async ctx=>{
		const data = ctx.request.body

		if (data.full_name) {

			//remote branches
			const remote_list = await get_json(ctx,`/repos/${data.full_name}/branches`)

			//local branches
			let local_list = []
			let current_branch
			const repo_dir = path.resolve(opts.dir, data.full_name)
			if (fs.existsSync(repo_dir)) {
				current_branch = await git.currentBranch({dir:repo_dir})
				local_list = await git.listBranches({dir:repo_dir})
			}

			//current branch
			const branch_list = []
			for(const b of remote_list){
				const branch = {}
				branch.name = b.name
				branch.remote = true

				if (local_list.indexOf(b.name) !== -1) {
					branch.local = true
				}
				if (b.name === current_branch) {
					branch.current = true
				}
				branch_list.push(branch)
			}

			console.log(branch_list)

			ctx.body = branch_list
		} else {
			ctx.status = 400
			ctx.body = '{}'
		}


	})

	router.post('/api/ci/npm/list', async ctx=>{
		let body = '[]'
		try{
			const npm_path = path.join(opts.dir, 'node_modules')
			const list = await readdirAsync(npm_path)
			body = list.filter(a=>!a.startsWith('.'))

			//npm.list会乱报错：npm ERR! extraneous
			//const list = await npm.list(opts.dir)
			//body = list.filter(a=>a!=='(empty)')
		}catch(e){
			console.log(e)
		}
		ctx.body = body
	})

	router.post('/api/ci/user/repos', async ctx=>{
		try{
			const repo_list = await get_json(ctx,'/user/repos')
			const res_list = []

			//找出包含.sm文件的repo
			for(const repo of repo_list){
				try{
					await get_json(ctx,`/repos/${repo.full_name}/raw/master/.sm`)
					res_list.push(repo)
				}catch(e){
				}
			}

			res_list.sort((r1,r2)=>{
				const n1 = r1.full_name
				const n2 = r2.full_name
				return n1<n2?-1:n1>n2?1:0
			})
			ctx.body = res_list
		}catch(e){
			console.log(e)
			ctx.status = 500
			ctx.body = '{}'
		}
	})

	router.post('/api/ci/repo/clone', async ctx=>{
		try{
			const data = ctx.request.body
			const full_name = data.full_name

			//如果opts.username不是repo的协作者，增加协作者
			const collab_list = await get_json(ctx,`/repos/${full_name}/collaborators`)
			const ci_user_list = collab_list.filter(a=>a.username===opts.username)

			if (ci_user_list.length===0) {
				await put_json(ctx, `/repos/${full_name}/collaborators/${opts.username}`, {permission:'read'})
			}

			//如果没有钩子，加钩子
			const hook_list = await get_json(ctx, `/repos/${full_name}/hooks`)
			const ci_hook_list = hook_list.filter(a=>a.config.url)
			if (ci_hook_list.length===0) {
				const hook_opts = {
					type:'gogs',
					config:{
						url:opts.git_hook,
						content_type:'json'
					},
					events:['push'],
					active:true
				}
				await post_json(ctx, `/repos/${full_name}/hooks`, hook_opts)
			}

			//clone
			const params = new RepoOpts(full_name)
			params.ref = data.branch
			await git.clone(params)

			//找出api所用的模块，然后npm install
			const api_path = path.join(opts.dir,full_name,'api')
			const mod_path = path.join(opts.dir,full_name,'module')
			const api_js_list = await readdir(api_path,[ignore_non_js])
			const mod_js_list = await readdir(mod_path,[ignore_non_js])

			const module_list = []
			for(const file_name of mod_js_list){
				const mod_list = await get_modules(file_name)
				for(const m of mod_list){
					if (module_list.indexOf(m) === -1) {
						module_list.push(m)
					}
				}
			}
			for(const file_name of api_js_list){
				const mod_list = await get_modules(file_name)
				for(const m of mod_list){
					if (module_list.indexOf(m) === -1) {
						module_list.push(m)
					}
				}
			}

			//找出没有安装的module
			const node_modules_dir = path.join(opts.dir, 'node_modules')
			const install_list = []
			for(const m of module_list){
				const p = path.join(node_modules_dir, m)
				if (!fs.existsSync(p)) {
					install_list.push(m)
				}
			}
			if(install_list.length>0){
				console.log('begin npm install',install_list,opts.dir)
				await npm.install(install_list, {cwd:opts.dir,output:true,save:true})
				console.log('end npm install')
			}

		}catch(e){
			console.log(e)
			ctx.status = 400
		}
		ctx.body = '{}'
	})

	router.post('/api/ci/repo/checkout', async ctx=>{
		try{
			const data = ctx.request.body
			const params = new RepoOpts(data.full_name)
			params.ref = data.branch
			await git.checkout(params)
		}catch(e){
			console.log(e)
			ctx.status = 400
		}
		ctx.body = '{}'
	})

	//动态生成接口文档
	router.post('/api/ci/repo/apis', async ctx=>{
		const data = ctx.request.body
		let api_list = []
		if (data.full_name) {
			//opts.dir/full_name/api/...
			const api_dir = path.join(opts.dir, data.full_name, 'api')

			if (fs.existsSync(api_dir)) {
				//找出里面所有的js
				js_list = await readdir(api_dir, ['node_modules'])

				for(const js_path of js_list){
					if (!js_path.endsWith('.js')) {
						continue
					}

					//找handler
					const api_path = path.relative(opts.dir, js_path)
					let api_name

					if (api_path.endsWith('index.js')) {
						api_name = path.dirname(api_path)

					} else if (api_path.endsWith('.js')) {
						api_name = path.join(path.dirname(api_path),path.basename(api_path,'.js'))
					}

					if (api_name) {
						api_list.push(path.join('/',api_name))
					}
				}
			}
		}
		ctx.body = api_list.sort()
	})
}
