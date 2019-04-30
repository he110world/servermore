const fs = require('fs')
const path = require('path')
const git = require('isomorphic-git')
const superagent = require('superagent')
const util = require('util')
const readdir = util.promisify(require('recursive-readdir'))

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
						api_list.push(api_name)
					}
				}
			}
		}
		ctx.body = api_list.sort()
	})
}
