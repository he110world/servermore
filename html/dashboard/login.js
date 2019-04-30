imgui.contextify(function(){
	const dom = document.getElementById('login')
	let window_rect = imgui.rect(100,100,300,300)
	let token=''
	imgui.layout(dom, function(layout){
		window_rect = layout.window(window_rect, function(){
			layout.beginVertical()
			token = layout.textField(token, 'API令牌')
			if (layout.button('登录')) {
				const obj = {
					method:'POST',
					body:JSON.stringify({token:token}),
					headers:{
						'Content-Type': 'application/json'
					}
				}
				fetch('/api/ci/login',obj)
				.then(res=>{
					if (res.redirected){
						window.location = res.url
					} else {
						return res
					}
				})
				.catch(e=>console.log(e))
			}
			layout.endVertical()
		},'登录')
	})
})
