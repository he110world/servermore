//repo.js负责同步远程的repo信息

const fs = require('fs')
const exec = require('./exec-async')
const gogs = require('./gogs')

class Branch {
	constructor(name){
		this.name = name
	}
}

class Repo {
	_get_git_url({href,username,password,full_name}){
		const url = new URL(href)
		url.username = username
		url.password = password
		return url.href + full_name + '.git'
	}

	constructor({token,dir,git,username,password,full_name}){
		const user_repo = full_name.split('/')

		this._token = token
		this._auth = `token ${token}`

		this._user = user_repo[0]
		this._name = user_repo[1]
		this._full_name = full_name

		this._root_dir = dir
		this._dir = path.join(root_dir, full_name)
		this._url = this._get_git_url({href:git.href,username,password,full_name})

		//this._url = 
	}

	_clone(){
		//git -C <root-dir>/<user>/<repo> clone <repo-url> master

		await exec(`git -C ${this._root_dir}/${this._full_name} clone ${this._url} master`)
	}

	async init(){
		//文件夹不存在就clone
		if (!fs.existsSync(this._dir)) {
			await this._clone()
		}

		//从服务器获取分支信息
		const branch_list = await gogs_client.branches(

		
		//每个分支的worktree是否存在？

		//每个分支git worktree

		//worktree是否需要更新？


	}
}

module.exports = Repo
