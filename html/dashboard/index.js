imgui.contextify(function(){
	const dom = document.getElementById('index')
	let repo_window_rect = imgui.rect(100,100,500,300)
	let repo_new_rect = imgui.rect(150,150,300,300)
	let repo_list, npm_list
	let show_repo_new = false

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

	function draw_repo_info(layout,repo){
		layout.beginHorizontal()

		if (repo.checkingout) {
			layout.label('正在检出分支...')
		} else {
			const name_list = []
			let current_idx = -1
			for(let i=0; i<repo.branches.length; i++){
				const b = repo.branches[i]
				name_list.push(b.name)
				if (b.current) {
					current_idx = i
				}
			}

			//已经clone了
			if (current_idx >= 0) {
				const new_idx = layout.dropDown(current_idx, name_list, '本地分支')

				//切换分支
				if (new_idx !== current_idx) {
					const oldb = repo.branches[current_idx]
					const newb = repo.branches[new_idx]
					newb.current = true
					oldb.current = false

					const obj = {
						full_name:repo.full_name,
						branch:newb.name
					}

					repo.checkingout = true
					invoke_api('/repo/checkout',obj)
					.then(res=>{
						repo.checkingout = false
					})
					.catch(err=>console.log(err))
				}

			} else {
				if (repo.cloning) {
					layout.label('正在部署...')
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

							repo.cloning = true
							invoke_api('/repo/clone',obj)
							.then(res=>{
								repo.cloning = false

								invoke_api('/repo/branches',obj)
								.then(res=>{
									repo.branches=res
								})
								.catch(err=>console.log(err))
							})
							.catch(err=>console.log(err))
						}
					}
				}
			}


		}

		layout.endHorizontal()

		if (repo.api_list) {
			if (layout.button('隐藏API列表')) {
				delete repo.api_list
			}
		} else {
			if (layout.button('显示API列表')) {
				invoke_api('/repo/apis', {full_name:repo.full_name})
				.then(res=>{
					repo.api_list = res
				})
			}
		}


		if (repo.api_list) {
			layout.beginVertical()
			for(const a of repo.api_list){
				layout.beginHorizontal()
				//api link
				layout.hyperlink(a,a.replace(`/${repo.full_name}/api/`,''))

				//edit api src
				const edit_url = '/api/ci/edit' + a
				layout.hyperlink(edit_url,'⧉')
				layout.endHorizontal()
			}
			layout.endVertical()
		}

		if (repo.module_list) {
			if (layout.button('隐藏module列表')) {
				delete repo.module_list
			}
		} else {
			if (layout.button('显示module列表')) {
				invoke_api('/repo/modules', {full_name:repo.full_name}).then(res=>{
					repo.module_list = res
				})
			}
		}

		if (repo.module_list) {
			layout.beginVertical()
			for(const m of repo.module_list){
				layout.beginHorizontal()

				layout.label(m,'width:fit-content;')

				//edit api src
				const edit_url = `/api/ci/edit/${repo.full_name}/module/${m}`
				layout.hyperlink(edit_url,'⧉')

				layout.endHorizontal()
			}
			layout.endVertical()
		}

		if (repo.file_list) {
			if (layout.button('隐藏文件列表')) {
				delete repo.file_list
			}
		} else {
			if (layout.button('显示文件列表')) {
				invoke_api('/repo/files', {full_name:repo.full_name}).then(res=>{
					repo.file_list = res
				})
			}
		}

		if (repo.file_list) {
			layout.beginVertical()
			for(const m of repo.file_list){
				layout.beginHorizontal()

				if (m.endsWith('.html')) {
					const file_url = `/${repo.full_name}/file/${m}`
					layout.hyperlink(file_url,m)
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

	}

	function draw_repo(layout,repo){

		layout.beginVertical()

		draw_repo_title(layout,repo)

		//repo status
		if (repo._expanded) {
			if (!repo.branches) {
				//branch info
				repo.branches = []
				const obj = {full_name:repo.full_name}
				invoke_api('/repo/branches', obj)
				.then(res=>{
					repo.branches=res
				})
				.catch(err=>console.error(err))
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


	let repo_new_data = {}
	let repo_new_pending = false
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
	})
})
