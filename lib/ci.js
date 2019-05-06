const fs = require('fs')
const path = require('path')
const git = require('isomorphic-git')
const superagent = require('superagent')
const util = require('util')
const readdir = util.promisify(require('recursive-readdir'))
const npm_client = require('./npm-util')
const fs_extra = require('fs-extra')

const readdirAsync = util.promisify(fs.readdir)
const readFileAsync = util.promisify(fs.readFile)
const writeFileAsync = util.promisify(fs.writeFile)
const mkdirAsync = util.promisify(fs.mkdir)

const ncp = util.promisify(require('ncp').ncp)

function ignore_non_js(file,stats){
	return !stats.isDirectory() && !file.endsWith('.js')
}

class GitClient {
	constructor({dir,git,username,password}){
		this._dir = dir
		this._username = username
		this._password = password
		this._git_url = git
	}

	_resolve_path(full_name){
		return path.resolve(this._dir, full_name)
	}

	_get_params(full_name){
		return {
			dir:path.join(this._dir, full_name),
			url:this._git_url.href + full_name + '.git',
			username:this._username,
			password:this._password
		}
	}

	async branches(full_name){
		//local branches
		let local_list = []
		const repo_dir = this._resolve_path(full_name)
		if (fs.existsSync(repo_dir)) {
			local_list = await git.listBranches({dir:repo_dir})
		}
		return local_list
	}

	//创建local branch
	async branch({full_name,branch}){
		const dir = this._resolve_path(full_name)
		const ref = branch

		return await git.branch({dir, ref})
	}

	async current_branch(full_name){
		const repo_dir = this._resolve_path(full_name)
		if (fs.existsSync(repo_dir)) {
			let curr = await git.currentBranch({dir:repo_dir})

			//detached HEAD
			if (curr === undefined) {
				curr = await git.resolveRef({ref:'HEAD',dir:repo_dir})
			}
			return curr
		} else {
			return ''
		}
	}

	async clone({branch,full_name}){
		const params = this._get_params(full_name)
		params.ref = branch
		return await git.clone(params)
	}

	async add(full_name,filepath){
		await git.add({dir:this._resolve_path(full_name), filepath})
	}

	async commit(full_name,message){
		await git.commit({
			dir:this._resolve_path(full_name),
			author:{
				name:this._username,
				email:`${this._username}@example.com`
			},
			message
		})
	}

	async push(full_name,remote,ref){
		await git.push({
			dir:this._resolve_path(full_name),
			remote,
			ref,
			username:this._username,
			password:this._password
		})
	}

	async checkout({full_name,branch,oid}){
		const params = this._get_params(full_name)
		if (oid) {
			params.ref = oid
		} else {
			params.ref = branch
		}
		await git.checkout(params)
	}

	async pull({full_name,branch}){
		const params = this._get_params(full_name)
		params.ref = branch
		await git.pull(params)
	}

	async log(full_name,ref,depth){
		return await git.log({
			dir:this._resolve_path(full_name),
			ref,
			depth
		})
	}
}

class GogsClient {
	constructor({dir,git}){
		this._dir = dir
		this._git_url = git
	}

	async _invoke_api(ctx,api,method,payload){
		method = method || 'get'
		const u = this._git_url.resolve('/api/v1' + api)
		const token = ctx.cookies.get('gogs-token')
		const auth = `token ${token}`
		let req = superagent[method](u).set('Authorization', auth)
		if (payload) {
			req = req.send(payload)
		}
		const res = await req
		return res.body
	}

	async user(ctx){
		return await this._invoke_api(ctx, '/user')
	}

	async user_repos(ctx){
		const repo_list = await this._invoke_api(ctx,'/user/repos')
		const res_list = []

		//找出包含.sm文件的repo
		for(const repo of repo_list){
			try{
				await this._invoke_api(ctx,`/repos/${repo.full_name}/raw/master/.sm`)
				res_list.push(repo)
			}catch(e){
			}
		}

		res_list.sort((r1,r2)=>{
			const n1 = r1.full_name
			const n2 = r2.full_name
			return n1<n2?-1:n1>n2?1:0
		})
		return res_list
	}

	async add_repo(ctx,name){
		const params = {
			name:name,
			private:true
		}
		await this._invoke_api(ctx, '/user/repos', 'post', params)
	}

	async add_hook(ctx,full_name,git_hook){
		//如果没有钩子，加钩子
		const hook_list = await this._invoke_api(ctx, `/repos/${full_name}/hooks`)
		const ci_hook_list = hook_list.filter(a=>a.config.url===git_hook)
		if (ci_hook_list.length>0) {
			return
		}

		//挂钩子
		const hook_opts = {
			type:'gogs',
			config:{
				url:git_hook,
				content_type:'json'
			},
			events:['push'],
			active:true
		}
		return await this._invoke_api(ctx, `/repos/${full_name}/hooks`, 'post', hook_opts)
	}

	async add_collaborator(ctx,full_name,username){
		const collab_list = await this.get_collaborators(ctx,full_name)
		const ci_user_list = collab_list.filter(a=>a.username===username)
		if (ci_user_list.length===0) {
			await this._invoke_api(ctx, `/repos/${full_name}/collaborators/${username}`, 'post', {permission:'write'})
		}
	}

	async  get_collaborators(ctx,full_name){
		return await this._invoke_api(ctx,`/repos/${full_name}/collaborators`)
	}

	async branches(ctx,full_name){
		return await this._invoke_api(ctx,`/repos/${full_name}/branches`)
	}
}

let gogs_client, git_client

module.exports = (router, opts)=>{
	npm_client.init(opts.dir)

	gogs_client = new GogsClient(opts)
	git_client = new GitClient(opts)

      	async function check_cookie(ctx,next){
		const token = ctx.cookies.get('gogs-token')
		if (token) {
			await next()
		} else {
			ctx.redirect('/dashboard/login.html')
		}
	}

	async function write_sm_file(full_name,str){
		const sm_path = path.join(opts.dir, full_name, '.sm')
		await writeFileAsync(sm_path, str, 'utf8')
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

		if (typeof data.full_name !== 'string') {
			ctx.status = 400
			ctx.body = {}
			return
		}

		//remote branches
		const remote_info_list = await gogs_client.branches(ctx,data.full_name)
		const local_list = await git_client.branches(data.full_name)
		const current_branch = await git_client.current_branch(data.full_name)

		if (current_branch) {
			if (local_list.indexOf(current_branch)===-1) {
				local_list.push(current_branch)
			}
		}

		//current branch
		const remote_list = []
		const branch_list = []
		for(const remote of remote_info_list){
			const branch = {}
			branch.name = remote.name
			branch.remote = true

			if (local_list.indexOf(remote.name) !== -1) {
				branch.local = true
			}
			if (current_branch === remote.name) {
				branch.current = true
			}

			//local branch log
			if (branch.local) {
				branch.logs = await git_client.log(data.full_name,branch.name,5)
			}
			branch_list.push(branch)

			remote_list.push(remote.name)
		}

		for(const local of local_list){
			if (remote_list.indexOf(local) === -1) {
				const branch = {}
				branch.name = local
				branch.local = true
				if (current_branch === local) {
					branch.current = true
				}
				branch_list.push(branch)
			}
		}

		ctx.body = branch_list
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
			ctx.body = await gogs_client.user_repos(ctx)
		}catch(e){
			console.log(e)
			ctx.status = 500
			ctx.body = {}
		}
	})

	router.post('/api/ci/repo/new', async ctx=>{
		try{
			const data = ctx.request.body
			if (data.name) {
				//获取用户名
				const user = await gogs_client.user(ctx)
				const full_name = `${user.username}/${data.name}`

				//创建repo
				await gogs_client.add_repo(ctx,data.name)

				//添加CI用户
				await gogs_client.add_collaborator(ctx,full_name,opts.username)

				//先把代码clone下来
				await git_client.clone(data)

				//模板
				const src_dir = path.join(__dirname, '../template')
				const dst_dir = params.dir
				await ncp(src_dir, dst_dir)

				//提交
				await git_client.add(full_name, '.')
				await git_client.commit(full_name,'init')
				await git_client.push(full_name,'origin','master')

				//挂钩子
				await gogs_client.add_hook(ctx, full_name, opts.git_hook)
			}
		}catch(e){
			ctx.status = 500
			console.log(e)
		}

		ctx.body = []
	})

	//创建新的branch，并且上传到gogs服务器
	router.post('/api/ci/branch/new', async ctx=>{
		try{
			const data = ctx.request.body
			if (data.branch && data.full_name) {
				//创建本地branch
				await git_client.branch(data)

				//修改.sm文件
				await write_sm_file(data.full_name, data.branch)

				//git add
				await git_client.add(data.full_name, '.')

				//git commit
				await git_client.commit(data.full_name, `create branch ${data.branch}`)

				//git push
				await git_client.push(data.full_name, 'origin', data.branch)

			} else {
				throw new Error('invalid branch')
			}
		}catch(e){
		}
		ctx.body = {}
	})

	//直接干掉文件夹
	router.post('/api/ci/repo/delete', async ctx=>{
		try{
			const data = ctx.request.body
			if (data.full_name) {
				const repo_dir = path.join(opts.dir, data.full_name)

				//防止传入破坏性的路径
				const rel_dir = path.relative(opts.dir, repo_dir)
				if (!rel_dir || rel_dir.startsWith('.')) {
					throw new Error('invalid repo')
				}

				await fs_extra.remove(repo_dir)
			}
		}catch(e){
			console.log(e)
			ctx.status = 400
		}
		ctx.body = {}
	})

	router.post('/api/ci/repo/clone', async ctx=>{
		try{
			const data = ctx.request.body
			const full_name = data.full_name
			if (full_name) {

				//如果opts.username不是repo的协作者，增加协作者
				await gogs_client.add_collaborator(ctx,full_name,opts.username)
				await gogs_client.add_hook(ctx, full_name, opts.git_hook)

				//clone
				await git_client.clone(data)

				//找出api所用的模块，然后npm install
				const api_path = path.join(opts.dir,full_name,'api')
				const mod_path = path.join(opts.dir,full_name,'module')
				const api_js_list = await readdir(api_path,[ignore_non_js])
				const mod_js_list = await readdir(mod_path,[ignore_non_js])

				await npm_client.install(api_js_list, mod_js_list)
			}
		}catch(e){
			console.log(e)
			ctx.status = 400
		}
		ctx.body = {}
	})

	router.post('/api/ci/repo/checkout', async ctx=>{
		try{
			const data = ctx.request.body
			await git_client.checkout(data)
			if (!data.oid) {
				await git_client.pull(data)
			}
		}catch(e){
			console.log(e)
			ctx.status = 400
		}
		ctx.body = {}
	})

	router.get('/api/ci/edit/*', async ctx=>{
		const api_path = path.relative('/api/ci/edit',ctx.url)
		const ext_name = path.extname(api_path)

		const parts = api_path.split('/')

		//找到repo (/user/repo)
		const repo_path = parts.slice(0,2).join('/')
		const repo_dir = path.join(opts.dir, repo_path)

		//找到当前的branch
		const branch = await git_client.current_branch(repo_path)

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
