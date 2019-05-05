const fs = require('fs')
const path = require('path')
const git = require('isomorphic-git')
const superagent = require('superagent')
const util = require('util')
const readdir = util.promisify(require('recursive-readdir'))
const npm = require('./npm-util')

const readdirAsync = util.promisify(fs.readdir)
const readFileAsync = util.promisify(fs.readFile)
const mkdirAsync = util.promisify(fs.mkdir)

const ncp = util.promisify(require('ncp').ncp)

function ignore_non_js(file,stats){
	return !stats.isDirectory() && !file.endsWith('.js')
}

module.exports = (router, opts)=>{
	npm.init(opts.dir)

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

	async function add_hook(ctx,full_name){
		//挂钩子
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

	router.post('/api/ci/repo/new', async ctx=>{
		try{
			const data = ctx.request.body
			if (data.name) {
				//获取用户名
				const user = await get_json(ctx, '/user')
				const full_name = `${user.username}/${data.name}`

				//创建repo
				await post_json(ctx, '/user/repos', {
					name:data.name,
					private:true
				})


				//添加CI用户
				await put_json(ctx, `/repos/${full_name}/collaborators/${opts.username}`, {permission:'write'})

				//先把代码clone下来
				const params = new RepoOpts(full_name)
				await git.clone(params)

				//模板
				const src_dir = path.join(__dirname, '../template')
				const dst_dir = params.dir
				await ncp(src_dir, dst_dir)

				//提交
				await git.add({dir:params.dir, filepath:'.'})
				await git.commit({
					dir:params.dir, 
					author:{
						name:opts.username,
						email:`${opts.username}@example.com`
					},
					message:'init'
				})
				await git.push({
					dir:params.dir,
					remote:'origin',
					ref:'master',
					username:opts.username,
					password:opts.password
				})

				//挂钩子
				await add_hook(ctx, full_name)
			}
		}catch(e){
			ctx.status = 500
			console.log(e)
		}

		ctx.body = []
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
			const ci_hook_list = hook_list.filter(a=>a.config.url===opts.git_hook)
			if (ci_hook_list.length===0) {
				await add_hook(ctx, full_name)
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

			await npm.install(api_js_list, mod_js_list)
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

	router.get('/api/ci/edit/*', async ctx=>{
		const api_path = path.relative('/api/ci/edit',ctx.url)
		const ext_name = path.extname(api_path)

		const parts = api_path.split('/')

		//找到repo (/user/repo)
		const repo_path = parts.slice(0,2).join('/')
		const repo_dir = path.join(opts.dir, repo_path)

		//找到当前的branch
		const branch = await git.currentBranch({dir:repo_dir})

		//生成gogs的url
		let gogs_url
		const remain_path = parts.slice(2).join('/')
		if (remain_path) {
			if (ext_name) {
				const file_path = path.join(opts.dir, api_path)
				gogs_url = `${opts.git.host}/${repo_path}/src/${branch}/${remain_path}`
			} else {
				let api_dir1 = path.join(opts.dir, api_path)
				if (!api_dir1.endsWith('.js')) {
					api_dir1 += '.js'
				}
				const api_dir2 = path.join(opts.dir, api_path, 'index.js')

				if (fs.existsSync(api_dir1)) {
					let path2 = remain_path
					if (!path2.endsWith('.js')) {
						path2 += '.js'
					}
					gogs_url = `${opts.git.host}/${repo_path}/src/${branch}/${path2}`
				} else if (fs.existsSync(api_dir2)) {
					const path2 = remain_path + '/index.js'
					gogs_url = `${opts.git.host}/${repo_path}/src/${branch}/${path2}`
				}
			}
		} else { //repo root
			gogs_url = `${opts.git.host}/${repo_path}`
		}

		if (gogs_url) {
			//自动跳转
			ctx.body = 
`
<!doctype><html><body><script>
window.location='http://${gogs_url}'
</script></body></html>
`
		} else {
			ctx.status = 404
			ctx.body = 'not found'
		}
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

					if (api_path.endsWith('/index.js')) {
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

	router.post('/api/ci/repo/modules', async ctx=>{
		const data = ctx.request.body
		const mod_list = []
		if (data.full_name) {
			const mod_dir = path.join(opts.dir, data.full_name, 'module')
			if (fs.existsSync(mod_dir)) {
				const file_list = await readdir(mod_dir, ['node_modules'])
				for(const p of file_list){
					if (p.endsWith('.js')) {
						mod_list.push(path.relative(mod_dir,p))
					}
				}
			}
		}
		ctx.body = mod_list.sort()
	})

	router.post('/api/ci/repo/files', async ctx=>{
		const data = ctx.request.body
		let file_list = []
		if (data.full_name) {
			const file_dir = path.join(opts.dir, data.full_name, 'file')
			if (fs.existsSync(file_dir)) {
				const list = await readdir(file_dir)
				file_list = list.map(a=>path.relative(file_dir,a))
			}
		}
		ctx.body = file_list.sort()
	})


}
