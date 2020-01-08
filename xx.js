// ==UserScript==
// @name         修仙福地
// @namespace    http://tampermonkey.net/
// @version      0.5.2
// @description  try to take over the world!
// @author       You
// @match        http://joucks.cn:3344/
// @updateURL    https://raw.githubusercontent.com/whosphp/xiuxianfudi/master/xx.js
// @downloadURL  https://raw.githubusercontent.com/whosphp/xiuxianfudi/master/xx.js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://cdn.jsdelivr.net/npm/vue/dist/vue.js
// @run-at document-end
// ==/UserScript==

let who_interval = setInterval(function () {
    'use strict';

    let userId = $('#userId').val()
    let currentLevel = parseInt($('#current-level').text())
    if (! userId) {
        console.log('Can not find user id')
        return;
    } else {
        clearInterval(who_interval)
    }

    // 只做这些帮派任务
    let valuedFactionTasks = [
        "5dca6a232b57001e2bc0273a",
        "5e13df3496d23f0961a85212",
        "5dca69c12b57001e2bc02733",
        "5dca839096003f20fd0df257",
        "5df337f1b0708370b73f36a3",
        "5dfc40ff6439e975fbbc6c7b",
        "5dfa1ad779b2846774bd9f5b",
        "5e0c2a502837c176c87ba1ef",
        "5dfec9bc016232536617c314"
    ]

    function getKey(key) {
        return userId + ':' + key
    }

    let roomIndex = GM_getValue(getKey('roomIndex'), 'unset')

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    let old = scoketConntionTeam;
    scoketConntionTeam = function (index) {
        GM_setValue(getKey('roomIndex'), index)

        let interval = setInterval(function () {
            if (socket === undefined || !socket) {
                old(index)
            } else if (socket.connected) {
                socket.off('disconnect')
                socket.on('disconnect', function () {
                    who_log_warning('disconnect')
                    who_notify('disconnect', 1)
                })

                socket.on("team", function (res) {
                    let type = res.type
                    switch (type) {
                        case "msg":
                            if (res.msg.includes('已达上限')) {
                                who_notify(res.msg)
                            }
                            break;
                        case "currentTeamDisband":
                            // 自己解散队伍时, 不发送通知
                            if (res.data !== $("#userId").val()) {
                                delete who_teams[res.data]
                                who_notify('队伍解散', 1)
                            }
                            break;
                        case "listTeamDisband":
                            if (typeof res.data == "string") {
                                delete who_teams[res.data]
                            } else {
                                delete who_teams[res.data.teamId]
                            }
                            break;
                    }
                })

                clearInterval(interval)
            }
        }, 1500)
    }

    unsafeWindow.who_teams = {}
    let oldTeamReload = teamReload
    teamReload = function (obj, type) {
        oldTeamReload(obj, type)

        if (type == 1) { // 初始队伍列表
            for (const item of obj.data) {
                who_teams[item.teamId] = item
            }
        } else if (type == 2) { // 创建队伍反馈
            let item = obj.data
            who_teams[item.teamId] = item

            // 如果自己是队长 则自动开始循环战斗
            if (item.teamId === $("#userId").val() && who_app.autoStartPerilTeamFunc) {
                startPerilTeamFunc(2)
                who_app.autoStartPerilTeamFunc = false
            }
        } else if (type == 3) { // 刷新我得队伍
            who_teams[obj.data.teamId] = obj.data
        }
    }

    $('.container-fluid > .homediv > div:first-child').append(`
<div id="who_helper">
<label>组队大厅: ${roomIndex}</label>
<table class="table table-condensed table-bordered">
    <tr>
        <td><input class="form-control input-sm" style="width: 60px;" v-model="form.goodsName" type="text" placeholder="名称"></td>
        <td><input class="form-control input-sm" style="width: 60px;" v-model="form.goodsNum" type="number" placeholder="数量"></td>
        <td style="vertical-align: middle;"><button class="btn btn-success btn-xs" type="button" @click="addNewSub">新建</button></td>
    </tr>
    <tr v-for="sub in subscribes">
        <td><input type="checkbox" :checked="sub.checked" @click="subCheckedClicked(sub)"></td>
        <td>{{ sub.goodsName }}</td>
        <td>{{ sub.goodsNum }}</td>
    <tr>
</table>
<form class="form-inline">
    <div class="form-group form-group-sm">
        <label>FB</label>
        <select class="form-control" v-model="fb">
            <option v-for="option in fbOptions" :value="option._id">{{ option.name }}</option>
        </select>
    </div>
    <br/>
    <button class="btn btn-success btn-xs" type="button" @click="autoApplyTeam(false)">ApplyTeam</button>
    <br/>
    <button class="btn btn-success btn-xs" type="button" @click="autoApplyTeam(true)">ApplyOrCreateTeam</button>
    <br/>
    <button class="btn btn-success btn-xs" type="button" @click="autoApplyTeam(true, true)">ApplyOrCreateTeam+AutoStart</button>
</form>
</div>
`)

    unsafeWindow.who_app = new Vue({
        'el': '#who_helper',
        data: {
            system: {
                maxLevel: 89
            },
            autoStartPerilTeamFunc: false,
            userGoodsPages: 1,// 背包物品总页数
            userBaseInfo: {
                nickname: 'nobody',
                'max-vitality-num': 500 + currentLevel,
                'max-energy-num': 300 + currentLevel
            },
            form: {
                goodsName: '',
                goodsNum: ''
            },
            fb: "",
            fbOptions: [],
            subscribes: GM_getValue(getKey('subscribes'), [])
        },
        created() {
            this.fb = GM_getValue('fb', "5dbfd22d4a3e3d2784a6a670") // 默认是密林
            this.getUserInitInfo()
        },
        watch: {
            fb(n, o) {
                GM_setValue('fb', n)
            }
        },
        methods: {
            autoApplyTeam(applyOrCreate, autoStartPerilTeamFunc) {
                if (!this.fb) {
                    return
                }

                let level = parseInt($('#current-level').text())

                for (let i = 4; i > 0; i--) {
                    for (const item of Object.values(who_teams)) {
                        if (item.scenesId == this.fb && !item.is_pwd && item.level[0] < level && item.users.length == i) {
                            applyTeamFunc(item.teamId, false)
                            return
                        }
                    }
                }

                // 找不到队伍则自动创建队伍
                if (! applyOrCreate) {
                    return
                }

                let scene = this.fbOptions.find(item => item._id === this.fb)
                if (scene !== undefined) {
                    this.autoStartPerilTeamFunc = !!autoStartPerilTeamFunc
                    sendToServerBase("createdTeam", {
                        teamScenesId: scene._id,
                        level: [parseInt(scene.min_level), parseInt(scene.max_level)],
                        pwd: ""
                    })
                }
            },
            addNewSub() {
                this.subscribes.push({
                    checked: true,
                    goodsName: this.form.goodsName,
                    goodsNum: this.form.goodsNum,
                })
            },
            getAllUserGoods() {
                for (let i = 1; i <= this.userGoodsPages; i++) {
                    $.get('/api/getUserGoods', {page: i})
                }
            },
            getUserInitInfo() {
                fetch("http://joucks.cn:3344/api/getUserInitInfo", {
                    credentials: "include",
                    method: "GET",
                }).then(function (response) {
                    return response.json()
                }).then(res => {
                    this.userBaseInfo.nickname = res.data.user.nickname
                })
            },
            setSubscribes() {
                GM_setValue(getKey('subscribes'), this.subscribes)
            },
            subCheckedClicked(sub) {
                sub.checked = ! sub.checked
                this.setSubscribes()
            }
        }
    })

    var host = 'http://xx.gl.test'

    function who_log_success(msg) {
        console.debug('%c' + msg, 'color: green; font-size: 16px;')
    }

    function who_log_warning(msg) {
        console.debug('%c' + msg, 'color: yellow; font-size: 16px;')
    }

    function send_to_local(data) {
        let a = new FormData();
        a.append('data', JSON.stringify(data))

        GM_xmlhttpRequest({
            method: "POST",
            url: host + "/api/log",
            data: a,
            onload: function (response) {}
        })
    }

    function who_notify(msg, bark) {
        msg = who_app.userBaseInfo.nickname + ':' + msg

        let url = host + "/notify?msg=" + msg

        if (bark) {
            url += '&bark=1'
        }

        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: function (response) {}
        })
    }

    function who_check_goods(datum, subscribe) {
        if (datum.goods && datum.goods.name == subscribe.goodsName && datum.count >= subscribe.goodsNum) {
            return true;
        }

        return false;
    }

    $(document).ajaxComplete(function (event, xhr, settings) {
        let res = xhr.responseJSON

        if (settings.url.startsWith("/api/getUserInitInfo")) {
            who_app.userBaseInfo.nickname = res.data.user.nickname
        }

        if (settings.url.startsWith("/api/getSellGoods")) {
            res.data.playerSellUser.map(user => {
                // 遍历线上交易的物品 todo
            })
        }

        if (settings.url.startsWith("/api/getUserGoods")) {
            who_app.userGoodsPages = res.pages
            res.data.map(datum => {
                who_app.subscribes.map(sub => {
                    if (sub.checked && who_check_goods(datum, sub)) {
                        who_log_success(sub.goodsName + '数量达成目标')
                        who_notify(sub.goodsName + '数量达成目标')
                        sub.checked = false;
                        who_app.setSubscribes()
                    }
                })
            })
        }

        if (settings.url.startsWith("/api/getUserInfo")) {
            let user = res.data.user
            // 50, 70 级需要完成主线任务 手动升级
            if (![50, 70].includes(user.level) && user.level < who_app.system.maxLevel && user.repair_num > user.next_level_num) {
                upgradeUserLevelFunc()
                who_notify('level up to ' + (user.level + 1))
            }

            // 定时制作物品 消耗精力 防止精力爆炸
            if (user.vitality_num >= who_app.userBaseInfo['max-vitality-num']) {
                makeLifeGoodsFunc(1)
            }

            if (user.energy_num >= who_app.userBaseInfo['max-energy-num']) {
                makeLifeGoodsFunc(2)
            }
        }

        if (settings.url.startsWith("/api/getCombatBeMonster")) {
            who_app.fbOptions = [
                {
                    name: '云顶封神塔',
                    _id: '5dfed126016232536617c5e0',
                    min_level: 0,
                    max_level: 300
                }
            ].concat(res.data.combatList)
        }

        if (settings.url.startsWith("/api/getUserTask")) {
            let factionTask = res.data.find(datum => datum.task.task_type === 4)
            if (factionTask !== undefined) {
                if (valuedFactionTasks.includes(factionTask.task._id)) {
                    setTimeout(function () {
                        payUserTask(factionTask.utid)
                    }, 1000)
                } else {
                    setTimeout(function () {
                        colseUserTask(factionTask.utid)
                    }, 1000)
                }
            }

            send_to_local({
                type: 'task',
                data: res.data.map(datum => {
                    return datum.task
                })
            })
        }

        if (settings.url.startsWith("/api/payUserTask")) {
            if (res.code == 200) {
                setTimeout(function () {
                    getFationTaskFunc()
                }, 1000)
            } else {
                who_notify(res.msg)
            }
        }

        if (settings.url.startsWith("/api/closeUserTask")) {
            if (res.code == 200) {
                setTimeout(function () {
                    getFationTaskFunc()
                }, 1000)
            } else {
                who_notify(res.msg)
            }
        }
    })

    // 进入组队大厅
    $('#fishfarm').click()
    if (roomIndex !== 'unset') {
        setTimeout(function () {
            $('a[id="fish-game-btn-c"]')[roomIndex].click()
        }, 500)
    }

    setInterval(function () {
        getUserInfoFunc()
    }, 300000) // 定时更新用户信息
    setInterval(function () {
        who_app.getAllUserGoods()
    }, 60000) // 定时更新背包信息
}, 500)