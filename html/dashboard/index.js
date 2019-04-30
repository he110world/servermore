imgui.contextify(function(){
	const dom = document.getElementById('index')
	let window_rect = imgui.rect(100,100,500,300)
	let repo_list

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
		layout.label(repo.full_name)

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
			layout.beginVertical()
			for(const a of repo.api_list){
				layout.label(a)
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



	imgui.layout(dom, function(layout){
		window_rect = layout.window(window_rect, function(){
			if (repo_list) {
				layout.beginVertical()
				if (layout.button('退出登录')){
					invoke_api('/logout')
					repo_list=null
					return
				}

				for(const repo of repo_list){
					draw_repo(layout,repo)
				}
				layout.endVertical()
			}
		},'仓库列表')
	})
})
