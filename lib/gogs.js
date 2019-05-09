const path = require('path')
const fs = require('fs')
const superagent = require('superagent')

async function invoke_api(api,git_url,token,method,payload){
	method = method || 'get'
	const u = git_url.href + 'api/v1' + api
	const auth = `token ${token}`
	let req = superagent[method](u).set('Authorization', auth)
	if (payload) {
		req = req.send(payload)
	}
	const res = await req
	return res.body
}

class GogsAuth {
	constructor(git_url,token){
		this._git_url = git_url
		this._token = token
	}

	async _invoke_api(api,method,payload){
		return await invoke_api(api,this._git_url,this._token,method,payload)
	}
}

class GogsRepo extends GogsAuth {
	constructor(user_name,git_url,repo_name,token){
		super(git_url,token)
		this._name = repo_name
		this._full_name = path.join(user_name, repo_name)
	}

	async add_hook(git_hook){
		//如果没有钩子，加钩子
		const hook_url = `/repos/${this._full_name}/hooks`
		const hook_list = await this._invoke_api(hook_url)
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
		return await invoke_api(hook_url,'post',hook_opts)
	}

	async add_collaborator(username){
		const collab_list = await this.get_collaborators()
		const ci_user_list = collab_list.filter(a=>a.username===username)
		if (ci_user_list.length===0) {
			const api_url = `/repos/${this._full_name}/collaborators/${username}`
			await this._invoke_api(api_url, 'put', {permission:'write'})
		}
	}

	async get_collaborators(){
		return await this._invoke_api(`/repos/${this._full_name}/collaborators`)
	}

	async get_branch_names(){
		return await this._invoke_api(`/repos/${this._full_name}/branches`)
	}
}

class GogsUser extends GogsAuth {
	constructor(user,git_url,token){
		super(git_url,token)
		this._name = user.username
		this._repo_dict = {}
	}

	async create_repo(name) {
		await this._invoke_api('/user/repos', 'post', {name:name,private:true})
	}

	async get_info(){
		return await this._invoke_api('/user')
	}

	async get_repo_names(){
		const repo_list = await this._invoke_api('/user/repos')
		const res_list = []

		//找出包含.sm文件的repo
		for(const repo of repo_list){
			try{
				await this._invoke_api(`/repos/${repo.full_name}/raw/master/.sm`)
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

	async add_hook(repo_name, git_hook){
		const repo = this._get_repo(repo_name)
		await repo.add_hook(git_hook)
	}

	async add_collaborator(repo_name, username){
		const repo = this._get_repo(repo_name)
		await repo.add_collaborator(username)
	}

	async get_collaborators(repo_name){
		const repo = this._get_repo(repo_name)
		return await repo.get_collaborators()
	}

	async get_branch_names(repo_name){
		const repo = this._get_repo(repo_name)
		return await repo.get_branch_names()
	}

	_get_repo(repo_name){
		if (repo_name.indexOf('/')!==-1) {
			repo_name = repo_name.split('/').pop()
		}

		let repo = this._repo_dict[repo_name]
		if (!repo) {
			repo = this._repo_dict[repo_name] = new GogsRepo(
				this._name,
				this._git_url,
				repo_name,
				this._token)
		}
		return repo
	}
}

class GogsManager {
	constructor(href){
		this._git_url = new URL(href)
		this._token_user_dict = {}
		this._user_dict = {}
	}

	async get_user(token){
		let user = this._token_user_dict[token]
		if (!user) {
			const user_data = await invoke_api('/user',this._git_url,token)
			user = new GogsUser(user_data,this._git_url,token)
			this._token_user_dict[token] = this._user_dict[user.name] = user
		}
		return user
	}
}

module.exports = GogsManager

