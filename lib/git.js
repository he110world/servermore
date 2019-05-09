const fs = require('fs')
const path = require('path')
const git = require('isomorphic-git')
const exec = require('./exec-async')
const util = require('util')
const mkdirp = util.promisify(require('mkdirp'))
const readdirAsync = util.promisify(fs.readdir)

class GitCommit {
	constructor(){
	}
}

class GitBranch {
	constructor(repo_dir,name){
		this._name = name
		this._repo_dir = repo_dir
		this._worktree_dir = path.join(repo_dir,name)
		this._commit_dict = {}
	}

	async sync(){
		//worktree不存在的话git worktree
		if (!fs.existsSync(this._worktree_dir)) {

			//git -C <root-dir>/<user>/<repo>/master worktree add ../<branch> <branch>
			const cmd = `git -C ${this._repo_dir}/master worktree add ../${this._name} ${this._name}`
			await exec(cmd)
		}
	}

	//git grep '[^\.]require\(([^)]*)\)'
	async grep(pattern){
		const cmd = `git -C ${this._worktree_dir} grep ${pattern}`
		const output_str = await exec(cmd)
		if (output_str) {
			return output_str.split('\n')
		}
		return []
	}

	async logs(){
		const cmd = `git -C ${this._worktree_dir} log --pretty=format:'{"oid":"%H","message":"%s"},'`
		const str1 = await exec(cmd)
		let list = []
		if (str1.startsWith('{')) {
			const str2 = str1.substr(0,str1.lastIndexOf(','))
			list = JSON.parse(`[${str2}]`)
		}
		return list
	}
}

class GitRepo {
	constructor(root_dir,repo_url,user_name,repo_name){
		this._root_dir = root_dir
		this._repo_url = repo_url
		this._user_name = user_name
		this._name = repo_name

		this._repo_dir = `${this._root_dir}/${this._user_name}/${this._name}`

		this._branch_dict = {}
		this._commit_dict = {}
	}

	_get_branch(branch_name){
		let branch = this._branch_dict[branch_name]
		if (!branch) {
			branch = this._branch_dict[branch_name] = new GitBranch(this._repo_dir,branch_name)
		}
		return branch
	}

	async sync(branch_list){

		//文件夹不存在的话直接clone到 <root-dir>/<user>/<repo> clone <repo-url> master
		if (!fs.existsSync(this._repo_dir)) {
			const cmd = `git -C ${this._root_dir} clone ${this._repo_url} ${this._user_name}/${this._name}/master`
			await exec(cmd)
		}

		for(const b of branch_list){
			const branch = this._get_branch(b.name)
			await branch.sync()
		}
	}

	async grep(pattern){
		const list = []
		for(const branch_name in this._branch_dict){
			const branch = this._branch_dict[branch_name]
			const line_list = await branch.grep(pattern)
			list.push(...line_list)
		}
		const list2 = list.filter(a=>a)

		//去重
		const res_list = []
		for(const line of list2){
			if (res_list.indexOf(line) === -1) {
				res_list.push(line)
			}
		}
		return res_list
	}

	async branches(){
		if (fs.existsSync(this._repo_dir)) {
			return await readdirAsync(this._repo_dir)
		} else {
			return []
		}
	}

	async branch_logs(branch_name){
		const list = []
		if (branch_name) {
			const branch = this._get_branch(branch_name)
			list.push(branch)
		} else {
			list.push(...Object.values(this._branch_dict))
		}

		const log_list = []
		for(const branch of list){
			const logs = await branch.logs()
			log_list.push(...logs)
		}
		return log_list
	}

	async serve_commit(oid){
	}
}

class GitUser {
	constructor(root_dir,git_url,user_name){
		this._root_dir = root_dir
		this._git_url = git_url
		this._name = user_name
		this._repo_dict = {}
	}

	_get_repo(repo_name){
		let repo = this._repo_dict[repo_name]
		if (!repo) {
			const repo_url = `${this._git_url.href}${this._name}/${repo_name}.git`
			repo = this._repo_dict[repo_name] = new GitRepo(this._root_dir,repo_url,this._name,repo_name)
		}
		return repo
	}

	async sync(repo_name, branch_list){
		const repo = this._get_repo(repo_name)
		await repo.sync(branch_list)
	}

	async grep(repo_name, pattern){
		const repo = this._get_repo(repo_name)
		return await repo.grep(pattern)
	}

	async branches(repo_name){
		const repo = this._get_repo(repo_name)
		return await repo.branches()
	}

	async branch_logs(repo_name,branch_name){
		const repo = this._get_repo(repo_name)
		return await repo.branch_logs(branch_name)
	}
}

class GitManager {
	constructor(root_dir,git_url,ci_username,ci_password){
		git_url = new URL(git_url.href)
		git_url.username = ci_username
		git_url.password = ci_password

		this._root_dir = root_dir
		this._git_url = git_url
		this._user_dict = {}
	}

	_get_user(username){
		if (username.indexOf('/')) {
			username = username.split('/').shift()
		}

		let user = this._user_dict[username]
		if (!user) {
			user = this._user_dict[username] = new GitUser(this._root_dir,this._git_url,username)
		}
		return user
	}

	async sync(full_name, branch_list){
		const [user_name,repo_name] = full_name.split('/')
		const user = this._get_user(user_name)
		await user.sync(repo_name, branch_list)
	}

	async grep(full_name, pattern){
		const [user_name,repo_name] = full_name.split('/')
		const user = this._get_user(user_name)
		return await user.grep(repo_name, pattern)
	}

	async branches(full_name){
		const [user_name,repo_name] = full_name.split('/')
		const user = this._get_user(user_name)
		return await user.branches(repo_name)
	}

	async branch_logs(full_name,branch_name){
		const [user_name,repo_name] = full_name.split('/')
		const user = this._get_user(user_name)
		return await user.branch_logs(repo_name,branch_name)
	}
}

module.exports = GitManager
