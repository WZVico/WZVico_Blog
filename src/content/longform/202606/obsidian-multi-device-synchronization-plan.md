---
title: Obsidian 多端同步计划
description: 整个方案以绿联 NAS 为同步中枢：NAS 内通过 Docker 部署 `CouchDB` ，负责存放 Obsidian
  笔记数据；外部则借助 `Cloudflare Tunnel` ，把原本只在内网可访问的服务映射到公网自定义域名。各个平台上的 Obsidian 再通过
  `Self-hosted LiveSync` 插件连接 `CouchDB` ，便可实现跨设备、跨网络、端到端加密笔记同步。
date: 2026-06-17
slug: obsidian-multi-device-synchronization-plan
badge: 指南
tags:
  - obsidian
  - 同步
  - docker
  - cloudflare
draft: false
archive: true
author:
  name: WZVico
---

## 前置需求

- 绿联 NAS（支持 Docker 的 NAS 均可）
- 自定义域名（DNS 托管在 Cloudflare）
- 多端 Obsidian（以 Windows、Android 为例）

## 同步计划

先准备一个本地文档，对以下配置粘贴后进行自定义修改，方便后面配置过程中直接拷贝。
```plaintext
CouchDB 容器及文件夹名称：obsidian-couchdb  
CouchDB 数据库名称：obsidian_db  
COUCHDB_USER 数据库用户名：Your_name  
COUCHDB_PASSWORD 数据库密码：YOUR_STRONG_PASSWORD1  
隧道及规则名称： ugreen-obsidian  
Docker 运行命令（过程中生成）：  
Cloudflared 容器及文件夹名称： cloudflared-obsidian  
公网同步地址：https://obsidian.example.com  
Self-hosted LiveSync 端到端加密密码：YOUR_STRONG_PASSWORD2  
Setup URI 加密密码：YOUR_STRONG_PASSWORD3
```
密码可使用 [1Password](https://1password.com/zh-cn/password-generator) 生成，**请注意保存好密码**。

### CouchDB 数据库部署

#### 部署文件夹与配置文件准备

打开绿联云 Nas 的「文件管理」，创建 CouchDB 部署文件夹 `obsidian-couchdb` ，并在其中分别创建 `data` 与 `local.d` 两个子文件夹，文件夹结构如下所示：

```plaintext
文件管理  
|____ 共享文件夹  
    |____ docker  
        |____ obsidian-couchdb  
            |____ data  
            |____ local.d
```

在电脑本地新建一个文本文档，将以下内容粘贴进去，另存为 `local.ini` 。

注意文件名后缀是 `.ini` ，而不是 `.txt` 。

```ini
[couchdb]  
single_node = true  
max_document_size = 50000000  
​  
[chttpd]  
require_valid_user = true  
max_http_request_size = 4294967296  
enable_cors = true  
​  
[chttpd_auth]  
require_valid_user = true  
authentication_redirect = /_utils/session.html  
​  
[httpd]  
WWW-Authenticate = Basic realm="couchdb"  
enable_cors = true  
​  
[cors]  
origins = app://obsidian.md,capacitor://localhost,http://localhost  
credentials = true  
headers = accept, authorization, content-type, origin, referer  
methods = GET, PUT, POST, HEAD, DELETE  
max_age = 3600
```

将刚刚创建的 `local.ini` 文件上传至绿联云 Nas 的 `local.d` 文件夹中。

#### Dcoker 部署

直接在绿联云 Nas 的 Docker 「镜像仓库」搜索 `couchdb` 进行下载，待下载完毕后在「本地镜像」中找到 `couchdb` 开始创建容器

<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686777493_1.webp" alt="couchdb 镜像" />
  <figcaption class="figure-caption">couchdb 镜像</figcaption>
</figure>


在容器创建配置列表中，我们可以修改以下配置（部分变量在开始时已经自定义，直接拷贝自己的），然后点击「确定」创建容器：

```plaintext
容器名称： obsidian-couchdb  
​  
打开`自动重启`  
​  
添加以下环境变量：  
COUCHDB_USER ：Your_name  
COUCHDB_PASSWORD ：YOUR_STRONG_PASSWORD1  
​  
存储空间选择以下目录映射：  
NAS 目录/文件 >>>> 容器目录/文件 >>>> 容器权限  
共享文件夹/docker/obsidian-couchdb/data >>>> /opt/couchdb/data >>>> 读写  
共享文件夹/docker/obsidian-couchdb/local.d >>>> /opt/couchdb/etc/local.d >>>> 读写  
​  
端口映射：  
NAS 端口与容器端口均保持 5984；  
如果 NAS 端口被占用，可选择其它，但容器端口 5984 不得修改；  
对于容器端口 4369 及 9100 映射，可以直接选择删除
```

当我们容器创建成功之后，在 Docker 的「容器」界面可以发现 `obsidian-couchdb` 处于「运行中」状态。

此时我们在浏览器中打开以下网址（注意端口号自己是否调整）：

```plaintext
http://你的NAS局域网IP:5984
```

将会提示输入登录用户名与密码信息，填入信息登录后，看到类似以下信息，即证明部署成功。

```json
{"couchdb":"Welcome","version":"..."}
```

我们也可以打开以下网址进入数据库管理界面（注意端口号自己是否调整）：

```plaintext
http://你的NAS局域网IP:5984/_utils
```

### Cloudflare Tunnel 内网穿透

这一步操作的前提是已经有 DNS 托管在 Cloudflare 平台的自定义域名，请先自行操作解决该问题。

#### 在 Cloudflare 创建 Tunnel

打开 [Cloudflare 控制台](https://dash.cloudflare.com/) ，从左侧菜单栏按照以下顺序依次选择：

「Zero Trust」 >>>> 「网络」 >>>> 「连接器」

当我们进入「连接器」页面后，点击「创建隧道」开始进行隧道配置：

```plaintext
隧道类型： Cloudflared  
隧道名称（自定义）： ugreen-obsidian  
设备的操作系统：Docker
```

请注意此时 Cloudflare 会给你一段 Docker 运行命令，格式如下所示，我们需要将其复制，暂时放置在本地文档中记录，方便后续使用。

而下方的「连接器」将会不停在「正在搜索连接器...」与「未安装连接器」之间闪动。

<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686780124_2.webp" alt="Docker 运行命令及连接器" />
  <figcaption class="figure-caption">Docker 运行命令及连接器</figcaption>
</figure>

此时我们可先将配置页面放着不管，到绿联云 Nas 进行后续操作。

#### Cloudflared 容器创建

打开绿联云 Nas 的「文件管理」，创建 cloudflared 部署文件夹 `cloudflared-obsidian` ，其路径如下：

```plaintext
共享文件夹/docker/cloudflared-obsidian
```

然后打开绿联云 Nas 的 「Docker」 >>>> 「项目」 >>>> 「创建」，进行项目配置：

- 项目名称：cloudflared-obsidian
- 存放路径：点选 `共享文件夹/docker/cloudflared-obsidian`
- Compose 配置：
    - 请注意将下述内容粘贴进配置页面后，我们需要对最后一行 `command` 进行修改
    - 查看我们之前保存的 Docker 运行命令，即以 `docker run ...` 开头的那段，我们截取其中 `tunnel` 开始往后的内容，替换配置信息即可
    - 根据自身需求修改 `container_name` 容器名称

```yaml
services:  
    cloudflared:  
        image: cloudflare/cloudflared  
        container_name: cloudflared-obsidian  
        restart: always  
        network_mode: host  
        command: tunnel --no-autoupdate run --token XXXXXXXXXXX
```

上述信息确认调整无误后，点击「立即部署」。

当我们成功部署后，「容器」中有「cloudflared-obsidian」显示为运行中「运行中」，切换到 Cloudflare 网页配置页面，下方「连接器」将显示有连接器相关信息，状态为「已连接」。

<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686778731_3.webp" alt="连接器状态" />
  <figcaption class="figure-caption">连接器状态</figcaption>
</figure>



#### 自定义域名配置

当前面步骤顺利完成，点击「下一步」，我们将进入路由配置页面，以我的域名为例进行说明

```plaintext
主机名  
子域名（自定义）：obsidian  
域（选择自托管域名）example.com  
路径：空置  
​  
服务  
类型：HTTP  
URL（请注意前面是否修改端口号）: 你的NAS局域网IP:5984
```

上述配置代表 `https://obsidian.example.com` 将成为我们的公网同步地址。

配置填写完毕之后，直接点击「完成设置」即可。

但这并不意味着同步地址已经可以顺利访问，当我们将域名 DNS 托管在 Cloudflare 上时，Cloudflare 将会给域名上挑战认证，这会拦截同步请求。所以我们还需要给同步地址添加规则跳过挑战。

重新打开 [Cloudflare 控制台](https://dash.cloudflare.com/) ，从左侧菜单栏按照以下顺序依次选择：

「域名」 >>>> 「概览」 >>>> 「选择作为同步地址的域名」 >>>> 「安全性」 >>>> 「安全规则」

我们将选择「自定义规则」进行创建，按照以下内容配置并保存：

```plaintext
规则名称：obsidian_skip_challenge  
​  
当传入请求匹配时...  
编辑表达式

http.host eq "你的真实同步域名"
and starts_with(http.request.uri.path, "/_utils")
​  
然后采取措施...  
选择操作：阻止  
​  

​  
放置位置：  
选择顺序：第一个
```

```plaintext
规则名称：obsidian_skip_challenge  
​  
当传入请求匹配时...  
编辑表达式

(
  http.host eq "你的真实同步域名"
  and
  (
    http.request.uri.path eq "/"
    or http.request.uri.path eq "/_up"
    or http.request.uri.path eq "/_session"
    or http.request.uri.path eq "/_uuids"
    or http.request.uri.path eq "/obsidian_db"
    or starts_with(http.request.uri.path, "/obsidian_db/")
  )
)
​  
然后采取措施...  
选择操作：跳过  
​  
记录匹配的请求 √  
要调过的 WAF 组件：    
√ 所有Super Bot Fight 模式规则  
更多要跳过的组件  
√ 浏览器完整性检查  
√ 安全级别  
​  
放置位置：  
选择顺序：最后一个
```

### Windows 端插件设置

以下设置我们以初始空仓库为例进行

启用第三方插件需要我们先进入「设置」 >>>> 「第三方插件」 >>>> 「关闭安全模式」，然后「浏览」插件市场，直接搜索

```plaintext
Self-hosted LiveSync
```

并「安装」与「启用」插件。

第一次启用插件，会有「翻译可用！」弹窗提示，直接点击「OK」即可。

然后我们就进入了 Self-hosted LiveSync 插件配置向导流程。

由于我们的 Windows 端作为对插件的初始化设置，因此直接依次选择「我是第一次进行设置」与「是的，我要配置新的同步」。

接下来确认连接方式，我们是自部署同步服务，选择「手动输入服务器信息」与「我知道服务器详情，让我手动输入」就可以进入下一步配置。

在「端到端加密」配置页，我们需要勾选上方「端到端加密」与中间的「Obfuscate Properties」选项，同时填入我们在本地拷贝文本中设置的「端到端加密密码」。要注意的是，我们勾选的选项一个负责对数据进行加密，一个负责混淆数据属性，对数据做了双重安全保障。

所以我们必须保存好「端到端加密密码」，不然无法在其它设备上解密数据，也再无法配置多设备同步。强烈建议保存在密码管理器中。

密码设置并保存好后，点击「Proceed」。

服务器类型选择我们部署的「CouchDB」，并「继续进行 CouchDB 设置」，然后按照之前的设置拷贝填入即可，这些信息应该都在本地文档中有记录

```plaintext
公网同步地址: https://obsidian.example.com  
COUCHDB_USER 数据库用户名：Your_name  
COUCHDB_PASSWORD 数据库密码：YOUR_STRONG_PASSWORD1   
CouchDB 数据库名称：obsidian_db
```

填写完毕后，无需勾选「Use Internal API」，直接点击「Detect and Fix CouchDB Issues」，按钮下方文字将会变成「All checks passed successfully!」检测通过。

而如果之前在 Cloudflare 对自定义域名设置规则以跳过挑战，这里检测将会报错。

检测通过后点击「Test Settings and Continue」，右上角将会弹出三个黑窗，显示「已成功连接至 obsidian_db」。

同时中间窗口显示内容大意为将从服务器下载最新的同步数据，重启后，本设备将使用服务器的数据重建数据库，直接点击「Restart and Fetch Data」重启并获取数据。


<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686775150_4.webp" alt="Restart and Fetch Data" />
  <figcaption class="figure-caption">Restart and Fetch Data</figcaption>
</figure>



接下来的两步操作都是关于拉取远程数据与本地数据合并的，由于我们的数据库是新的，所以操作并没有实际意义，跟着走流程就行，最终还会让选择用本地文件覆盖远程数据。


然后我们就进入了数据合并选项页面，三个选项分别代表着：

- Compare time and take newer：比较时间，保留最新，系统会尝试根据修改时间合并更改
- Overwrite all with remote files：使用远程数据全量覆盖本地文件，如果当前库有重要数据，务必提前备份
- Use the detailed flow：详细设置

直接选择「Overwrite all with remote files」就行。虽然是全量覆盖，但是下一步还是会让我们选择如何处理本地文件。

<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686772262_5.webp" alt="Overwrite all with remote files" />
  <figcaption class="figure-caption">Overwrite all with remote files</figcaption>
</figure>



如何处理额外的本地文件？

对于远程数据库中不存在的本地文件，给了两种处理方式：

- Delete local files if not on remote：删除
- Keep local files even if not on remote：保留

可选择选择保留「Keep local files even if not on remote」，这样无论本地有没有文件都适用。

<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686778440_6.webp" alt="Keep local files even if not on remote" />
  <figcaption class="figure-caption">Keep local files even if not on remote</figcaption>
</figure>



选择之后，插件会重启同步流程，并在右上角给出一大串黑色弹窗提示，我们无需理会，等待「Self-hosted LiveSync 配置诊断」窗口弹起。

然后依次点击「确定」>>>>「修复」>>>>「修复」>>>>「修复」，插件将再次重启，进入「最终确认：用本机文件覆盖服务器数据」。

因为我们是首次搭建，所以远程的 CouchDB 数据库是空的，我们可以在这个环节将当前设备的 Obsidian 数据同步到远程，生成一份新的远程数据。

首先要进行三个勾选，缺少任意一个都无法点击覆盖按钮

- [ ]  我明白其他手机或电脑上的所有修改都将丢失。
- [ ]  我明白其他设备将无法继续同步，需要重新设置同步信息。
- [ ]  我明白此操作一旦执行便无法撤销。

下面警告信息在提示本地库是否备份，我们选择前两个选项已经备份或者不用备份均可。

但如果本地库有数据，务必进行备份，再进行下一步操作。

确认备份完成后，点击「I Understand, Overwrite Server」进行服务器覆盖。

<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686778689_7.webp" alt="I Understand, Overwrite Server" />
  <figcaption class="figure-caption">I Understand, Overwrite Server</figcaption>
</figure>



随后会弹出一个名称为「选择」的窗口，大意为：您的设置与服务器略有不同。插件已使用服务器设置补全了不兼容的部分！

直接点击「OK」。

然后是一个倒计时提示：

```plaintext
Do you want to send all chunks before replication?  
是否要在同步前发送所有数据块？
```

点击「是」。

再接着是一个提醒窗口

```plaintext
All optional features are disabled  
Customisation Sync and Hidden File Sync willal be disabled.  
Please enable them from the setings screen after setup is complete.  
所有可选功能均已禁用  
自定义同步与隐藏文件同步也将一并禁用。  
设置完成后，请前往设置界面重新开启。
```

点击「OK」。

最后，终于到最后了，会弹出一个「设置数据库大小通知」，选个「2GB（标准）」就行了，这意味着当数据库大小即将到达这个数值时，将会提醒我们进行调整。

<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686772744_8.webp" alt="数据大小" />
  <figcaption class="figure-caption">数据大小</figcaption>
</figure>



至此，Self-hosted LiveSync 插件终于配置完成。

如果在 Obsidian 页面右上角没有看到报错，那么当前设备就已经可以把数据写入自建的 CouchDB 数据库，只等待我们添加其它设备的 Obsidian 进行同步了。

### Android 端接入同步

Android 端安装 Self-hosted LiveSync 插件的步骤与 Windows 端相同。启用插件之后首个弹窗依旧是「翻译可用！」提示，直接点击「OK」即可。

正式进入 Self-hosted LiveSync 插件配置向导流程后，由于我们在 Windows 端已经对插件做出了初始化配置，现在我们需要的是接入同步，因此点击「我要将设备加入现有同步配置」&「是的，我要把这台设备加入现有同步」。

进入「设备设置方式」页面，我们有三种方式加入已有设置，分别是：

- 使用 Setup URI：在 Windows 插件页面设置 Setup URI 加密密码后，将 Setup URI 链接及加密密码想办法发送到手机，粘贴输入设置信息
- 扫描二维码：使用手机扫描 Windows 插件页面二维码自动跳转
- 手动输入服务器信息：参照 Windows 端设置

最方便的是「扫描二维码」，我们需要在 Windows 插件设置进入以下页面，并点击「使用 QR 码」&「For your eyes only」即可看到二维码显示。

请注意，我们使用的扫描工具需要是手机自带浏览器或者扫描 app，才会实现自动跳转。使用微信或者第三方浏览器大概率失败。

<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686778604_9.webp" alt="设置" />
  <figcaption class="figure-caption">设置</figcaption>
</figure>



连接成功后，会进入到「Mostly Complete: 」选择页面，以确定数据库合并方式，我们选择中间的「My remote server is already set up. I want to join thisdevice.（我的远程服务器已设置好。我想接入此设备。）」，并点击「Proceed to the next step.」继续下一步，页面会刷新让我们重启并获取数据「Restart and Fetch Data」

Obsidian 重启后会再次提醒如何对数据进行处理，分别有以下操作：

- Compare time and take newer：比较时间，保留最新
- Overwrite all with remote files：使用远程文件覆盖本地
- Use the detailed flow：使用详细流程
- Cancel：取消

由于我的 Android 端 Obsidian 没有任何数据，我直接选择了「Overwrite all with remote files」，虽然远程也是空的。

接着会选择本地数据如何处理，选择「Delete local files if not on remote」删除远程不存在的本地文件，以保持数据统一。

如果本地有文件的话可以选择另外选项保留所有本地文件，但可能会产生重复项，需要在同步完成后手动清理这些重复内容。

最后再次进入了「设置数据库大小通知」，还是选个「2GB（标准）」。

终于，同步完成，如果 Windows 端有文件，那么可以看到已经同步到 Android 端了。

### 同步

经过前面看似复杂，实际点点点的设置之后，Windows 端与 Android 端的 Obsidian 数据已经借由 Self-hosted LiveSync 插件打通。

为更好自动同步，建议打开双端的 Self-hosted LiveSync 插件配置页面，选择「同步设置」标签，将「同步预设」调整为「LiveSync 同步」并点击「应用」。这时下方的「同步模式」将被调整为「LiveSync 同步」。

<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686770761_10.webp" alt="同步设置" />
  <figcaption class="figure-caption">同步设置</figcaption>
</figure>



需要注意的是：

- 目前这种同步只能实现笔记文件及包含笔记文件的文件夹自动同步。
- 没有笔记文件的空白文件夹是没有办法进行同步的。
- 第三方插件、主题、Obsidian 设置等需要通过手动进行同步。

空白文件夹想要同步的解决方法是让其不再空白，在其中添加一个占位笔记或者开启隐藏文件同步，放置一个隐藏文件假占位都可以。

而第三方插件、主题、Obsidian 设置等配置建议只在 Windows 端一侧进行，Android 端拉取同步，这样可以避免数据冲突，部分设置不生效。

在 Self-hosted LiveSync 插件配置页面的「设置」标签下拉，会发现有「启用额外和高级功能」，我们将前两个选项「启用高级功能」和「启用高级用户功能」，会发现配置页面的标签变多了。

<ul class="gallery">
  <li>
    <figure>
      <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686769002_11.webp" alt="高级功能" />
      <figcaption>高级功能</figcaption>
    </figure>
  </li>
  <li>
    <figure>
      <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686775857_12.webp" alt="启用高级功能" />
      <figcaption>启用高级功能</figcaption>
    </figure>
  </li>
</ul>



找到插头标志的「Customization Sync」标签，在两端分别为我们的不同设备命名，名称要不一致具有设备识别性。

然后依次打开「启用自定义同步」、「自动扫描自定义设置」、「定期扫描自定义设置」。

<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686773929_13.webp" alt="Customization Sync" />
  <figcaption class="figure-caption">Customization Sync</figcaption>
</figure>



当我们在 Windows 端调整第三方插件、主题、Obsidian 设置等配置后，在这个界面点击最下方的 「Open」进入以下窗口

<figure class="figure">
  <img src="https://imgbed.wzvico.com/file/blog/2026/06/17/1781686772501_14.webp" alt="Customization Sync" />
  <figcaption class="figure-caption">Customization Sync</figcaption>
</figure>



按照以下顺序执行操作进行同步：

- Windows 端
    - 点击「Scan changes」
    - 扫描完成后点击「Sync once」
    - 等待右上角同步状态执行完毕
- Android 端
    - 点击「Refresh」
    - 点击「Select All Shiny」
    - 点击「Apply All Selected」
    - 重启 Obsidian，大功告成。


---


:::info[参考]
本文参考 [Obsidian LiveSync 自建同步教程：飞牛 NAS Docker 部署 CouchDB 完整指南 | Obsidian 项目任务笔记模板 | FLO.W Obsidian](https://21obsidian.com/blog/obsidian-livesync-fn-nas-couchdb#%E5%89%8D%E8%A8%80) 进行部署。

更多方案请查看 [Obsidian 同步方案怎么选 | Obsidian 项目任务笔记模板 | FLO.W Obsidian](https://21obsidian.com/sync)
:::
