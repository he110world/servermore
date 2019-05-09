imgui.contextify(function(){
	const dom = document.getElementById('index')
	let repo_window_rect = imgui.rect(10,10,500,300)
	let repo_new_rect = imgui.rect(150,150,300,300)
	let branch_new_rect = imgui.rect(150,150,300,300)
	let repo_list, npm_list
	let show_repo_new = false, show_branch_new = false

	const api_url = '/api/ci'

	function invoke_api(name, data){
		const invoke_url = api_url + name
		const opts = {method:'POST'}
		if (data && typeof data === 'object') {
			opts.headers = {'Content-Type': 'application/json'}
			opts.body = JSON.stringify(data)
		}
		return fetch(invoke_url, opts)
		.then(res=>{
			if (res.redirected) {
				window.location = res.url
			} else {
				return res
			}
		})
		.then(res=>res.json())
	}

	function draw_repo_title(layout,repo){
		layout.beginHorizontal()

		//展开/收起
		if(layout.button(repo._expanded?'-':'+','width:25px;')){
			repo._expanded = !repo._expanded
		}
		layout.label(repo.full_name,'width:fit-content;')

		//edit api src
		const edit_url = '/api/ci/edit/' + repo.full_name
		layout.hyperlink(edit_url,'⧉')

		layout.endHorizontal()
	}

	function format_commit_msg(msg,n){
		n = n || 20
		if (msg.length>n) {
			msg = msg.substr(0,n)+'...'
		}
		return msg
	}

	function draw_repo_info(layout,repo){
		let show_detail = false

		layout.beginHorizontal()

		if (repo.state) {
			layout.label(repo.state)
		} else {
			const name_list = []
			let has_local = false
			//let current_idx = -1
			for(let i=0; i<repo.branches.length; i++){
				const b = repo.branches[i]
				name_list.push(b.name)

				if (b.local) {
					has_local = true
				}
				//if (b.current) {
				//	current_idx = i
				//}
			}

			//已经clone了
			//if (current_idx >= 0) {
			if (has_local) {
				show_detail = true
				const new_branch_idx = layout.dropDown(repo._branch_idx, name_list, '本地分支')
				if (repo._branch_idx !== new_branch_idx) {
					repo.api_list_dirty = true
					repo.module_list_dirty = true
					repo.file_list_dirty = true
					repo._branch_idx = new_branch_idx
				}

				//commit history
				const branch = repo.branches[repo._branch_idx]
				const logs = branch.logs
				if (logs) {
					msg_list = logs.map(log=>log.message)
					msg_list.push('显示更多...')
					branch._commit_idx = layout.dropDown(branch._commit_idx, msg_list, '版本')
				}

				layout.toggle(false,'默认')

				//checkout
				//if (repo._branch_idx !== new_idx || repo._commit_idx>0) {
				if (!has_local) {
					if (layout.button('检出')) {
						//const current_branch = repo.branches.find(r=>r.current)
						const obj = {
							full_name:repo.full_name,
							//branch:current_branch.name
						}
						if (repo._commit_idx>0) {
							obj.oid = logs[repo._commit_idx].oid
						}

						repo.state = '正在检出...'

						invoke_api('/repo/checkout',obj)
						.then(res=>{
							update_branches(repo)
							.then(res=>{
								delete repo.state
							})
							.catch(err=>console.log(err))
						})
						.catch(err=>console.log(err))
					}
				}

				//delete local repo
				if (layout.button('☢','width:30px;')) {
					repo.state = '正在删除...'

					invoke_api('/repo/delete', {full_name:repo.full_name})
					.then(()=>{
						update_branches(repo).then(()=>{
							delete repo.state
						})
					})
					.catch(e=>console.log(e))
				}

				//create a branch
				if (layout.button('➕','width:30px;')) {
					branch_new_data.full_name = repo.full_name
					show_branch_new = true
				}

				//refresh
				if (layout.button('⟳','width:30px;')) {
					repo.state = '正在刷新...'

					update_branches(repo).then(()=>{
						delete repo.state
					})
				}

			} else {
				if (repo.branches.length>0) {
					repo.remote_branch = repo.remote_branch || 'master'
					let old_idx
					for(let i=0; i<repo.branches.length; i++){
						const b = repo.branches[i]
						if (b.name === repo.remote_branch){
							old_idx = i
						}
					}
					const new_idx = layout.dropDown(old_idx, name_list, '远程分支')
					if (new_idx !== old_idx) {
						repo.remote_branch = repo.branches[new_idx].name
					}

					if (layout.button('部署')) {
						const obj = {full_name:repo.full_name,branch:repo.remote_branch}

						repo.state = '正在部署...'

						invoke_api('/repo/sync',obj)
						.then(res=>{

							invoke_api('/repo/branches',obj)
							.then(res=>{
								update_branches(repo)
								.then(()=>{
									delete repo.state
								})
								.catch(e=>console.log(e))
							})
							.catch(err=>console.log(err))
						})
						.catch(err=>console.log(err))
					}
				}
			}


		}

		layout.endHorizontal()

		if (show_detail) {
			const branch = repo.branches[repo._branch_idx]
			const params = {full_name:repo.full_name,branch:branch.name}
			if (branch._commit_idx !== 0) {
				const log = branch.logs[branch._commit_idx]
				params.oid = log.oid
			}

			if (repo.api_list_dirty) {
				invoke_api('/repo/apis', params)
				.then(res=>{
					repo.api_list = res
					repo.api_list_dirty = false
				})
			}

			if (repo.api_list) {
				if (layout.button('-API','width:60px;')) {
					delete repo.api_list
				} else {
					layout.beginVertical()
					for(const a of repo.api_list){
						layout.beginHorizontal()

						const text = a.replace(`/${repo.full_name}`,'')//a.replace(`/${repo.full_name}/${branch.name}/api/`,`/${branch.name}/`)
						//api link
						//if (repo.api_list_dirty) {
						//	layout.label(text,'width:fit-content;')
						//} else {
						layout.hyperlink(a,text)
						//}

						//edit api src
						const edit_url = '/api/ci/edit' + a
						layout.hyperlink(edit_url,'⧉')
						layout.endHorizontal()
					}
					layout.endVertical()
				}
			} else {
				if (layout.button('+API','width:60px;')) {
					invoke_api('/repo/apis', params)
					.then(res=>{
						repo.api_list = res
					})
				}
			}

			if (repo.module_list_dirty) {
				invoke_api('/repo/modules', params)
				.then(res=>{
					repo.module_list = res
					repo.module_list_dirty = false
				})
			}

			if (repo.module_list) {
				if (layout.button('-模块','width:60px;')) {
					delete repo.module_list
				} else {
					layout.beginVertical()
					for(const m of repo.module_list){
						layout.beginHorizontal()

						layout.label(m,'width:fit-content;')

						//if (!repo.module_list_dirty) {
						//edit api src
						const edit_url = `/api/ci/edit/${repo.full_name}/${branch.name}/module/${m}`
						layout.hyperlink(edit_url,'⧉')
						//}

						layout.endHorizontal()
					}
					layout.endVertical()
				}
			} else {
				if (layout.button('+模块','width:60px;')) {
					invoke_api('/repo/modules', params).then(res=>{
						repo.module_list = res
					})
				}
			}

			if (repo.file_list_dirty) {
				invoke_api('/repo/files', params)
				.then(res=>{
					repo.file_list = res
					repo.file_list_dirty = false
				})
			}

			if (repo.file_list) {
				if (layout.button('-文件','width:60px;')) {
					delete repo.file_list
					repo.file_list_dirty = false
				} else {
					layout.beginVertical()
					for(const m of repo.file_list){
						layout.beginHorizontal()

						if (m.endsWith('.html')) {
							const file_url = `/${repo.full_name}/${branch.name}/file/${m}`
							const file_text = `/${branch.name}/file/${m}`
							layout.hyperlink(file_url,file_text)
						} else {
							layout.label(m,'width:fit-content;')
						}

						//edit api src
						const edit_url = `/api/ci/edit/${repo.full_name}/file/${m}`
						layout.hyperlink(edit_url,'⧉')

						layout.endHorizontal()
					}
					layout.endVertical()
				}
			} else {
				if (layout.button('+文件','width:60px;')) {
					invoke_api('/repo/files', params).then(res=>{
						repo.file_list = res
					})
				}
			}
		}
	}

	function update_branches(repo){
		return new Promise((resolve,reject)=>{
			repo.branches = []
			const obj = {full_name:repo.full_name}
			invoke_api('/repo/branches', obj)
			.then(branch_list=>{
				repo.branches=branch_list
				repo._branch_idx = 0
				repo._commit_idx = 0
				resolve()
			})
			.catch(err=>{
				console.error(err)
				reject(err)
			})
		})
	}

	function draw_repo(layout,repo){

		layout.beginVertical()

		draw_repo_title(layout,repo)

		//repo status
		if (repo._expanded) {
			if (!repo.branches) {
				update_branches(repo)
			} else {
				draw_repo_info(layout,repo)
			}
		}
		layout.endVertical()
	}

	invoke_api('/user/repos')
	.then(res=>repo_list=res)
	.catch(err=>console.log(err))


	let npm_dirty = false
	let show_npm_list = false
	function draw_npm_btn(layout){
		const str = show_npm_list ? '隐藏npm列表' : '显示npm列表'

		if (npm_dirty){
			layout.label('正在获取npm列表')
		} else {
			if (layout.button(str)){
				if (show_npm_list) {
					npm_list = null
				} else {
					npm_dirty = true
					invoke_api('/npm/list').then(res=>{
						npm_list=res
						npm_dirty = false
					})
				}
				show_npm_list = !show_npm_list
			}
		}
	}

	function draw_new_repo_btn(layout){
		if (layout.button('新建工程')){
			show_repo_new = true
		}
	}

	function draw_logout_btn(layout){
		if (layout.button('退出登录')){
			invoke_api('/logout')
			repo_list=null
			return
		}
	}

	function draw_npm_list(layout){
		//显示npm列表
		if (!npm_dirty && show_npm_list && npm_list && npm_list.length>0) {
			layout.beginVertical()
			for(const n of npm_list){
				layout.label(n)
			}
			layout.endVertical()
		}
	}


	let repo_new_data = {}, branch_new_data = {}
	let repo_new_pending = false, branch_new_pending = false
	imgui.layout(dom, function(layout){
		repo_window_rect = layout.window(repo_window_rect, function(){
			if (repo_list) {
				layout.beginVertical()

				layout.beginHorizontal()

				draw_npm_btn(layout)

				draw_new_repo_btn(layout)

				draw_logout_btn(layout)

				layout.endHorizontal()

				draw_npm_list(layout)

	
				for(const repo of repo_list){
					draw_repo(layout,repo)
				}
				layout.endVertical()
			}
		},'控制台')

		if (show_repo_new) {
			repo_new_rect = layout.window(repo_new_rect, function(){

				layout.beginVertical()

				//工程名
				repo_new_data.name = layout.textField(repo_new_data.name, '工程名')

				//按钮
				if (repo_new_pending) {
					layout.label(`正在创建${repo_new_data.name}...`)
				} else {
					layout.beginHorizontal()
					if (layout.button('确定')) {
						if (repo_new_data.name) {
							repo_new_pending = true

							invoke_api('/repo/new', repo_new_data)
							.then(res=>{
								//刷新repo列表
								invoke_api('/user/repos')
								.then(res=>{
									repo_list=res
									show_repo_new = false
									repo_new_pending = false
								})
								.catch(err=>console.log(err))
							})
							.catch(err=>{
								console.log(err)
							})
						} else {
							alert('工程名不能为空！')
						}
					}
					if (layout.button('取消')) {
						repo_new_data = {}
						show_repo_new = false
					}
					layout.endHorizontal()
				}

				layout.endVertical()
			},'新建工程')
		}

		if (show_branch_new) {
			branch_new_rect = layout.window(branch_new_rect, function(){

				layout.beginVertical()

				//分支名
				branch_new_data.branch = layout.textField(branch_new_data.branch, '分支名')

				//按钮
				if (branch_new_pending) {
					layout.label(`正在创建${branch_new_data.name}...`)
				} else {
					layout.beginHorizontal()
					if (layout.button('确定')) {
						if (branch_new_data.branch) {
							branch_new_pending = true

							invoke_api('/branch/new', branch_new_data)
							.then(res=>{
								//刷新repo列表
								invoke_api('/user/repos')
								.then(res=>{
									repo_list=res
									show_branch_new = false
									branch_new_pending = false
								})
								.catch(err=>console.log(err))
							})
							.catch(err=>{
								console.log(err)
							})
						} else {
							alert('分支名不能为空！')
						}
					}
					if (layout.button('取消')) {
						delete branch_new_data.full_name
						delete branch_new_data.branch
						show_branch_new = false
					}
					layout.endHorizontal()
				}

				layout.endVertical()
			},'新建分支')

		}
	})
})
