# servermore
serve websites from git repo

### 四个文件夹  
* api  
文件夹里的脚本会被servermore动态执行  
* file
文件夹里的文件可以被客户端直接读取，服务器不能读取  
* module  
可以被api文件夹中的脚本require  
可以require node\_modules文件夹中的模块  
* volume  
fs模块可以读写该文件夹中的文件，该文件夹对fs来说就是根目录
