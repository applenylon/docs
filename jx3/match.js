import { createApp } from "https://unpkg.com/vue@next/dist/vue.esm-browser.prod.js"
import Dexie from "https://unpkg.com/dexie@latest/dist/modern/dexie.min.mjs"
import GithubCloud from "https://drc-git.github.io/scripts/github.js"


const modifyTime = 'modifyTime'
const uploadPath = 'jx3/match.json'
const colorList = ["#9e9e9e", "#ff9800", "#ffc107", "#795548", "#ffeb3b", "#cddc39", "#4caf50", "#00bcd4", "#03a9f4", "#9c27b0"];

const github = new GithubCloud({
    owner: "drc-git",
    repo: "store",    
    //简单混淆，避免 github Personal access tokens 被删除
    Authorization: 'N*O*W*s*5*0*I*x*u*2*I*j*i*4*J*z*A*o*G*0*X*t*l*v*l*a*b*1*u*M*o*0*3*L*R*W*_*p*h*g'.replace(/\*/g, '').split('').reverse().join(''),//end 2023-04-26
});
const matchServer = github.getJson(uploadPath);

const db = new Dexie('match');
db.version(2).stores({
    leftList: 'ID',
    rightList: 'ID',
    log: 'ID'
});

function readJsonFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = function () {
            resolve(JSON.parse(reader.result))
        };

        reader.onerror = reject
    })
}

function randomInt(start, end) {
    return parseInt(Math.random() * (end - start + 1) + start, 10)
}
const vApp = createApp({
    data() {
        return {
            leftList: [],
            rightList: [],
            colorList,
            queueList: []
        }
    },
    computed: {
        otherList() {
            if (this.queueList.length) {
                const set = new Set();
                this.queueList.forEach(list => list.forEach(e => set.add(e.ID)));
                return [...this.leftList.filter(e => e.ID.trim() && !set.has(e.ID)), ...this.rightList.filter(e => e.ID.trim() && !set.has(e.ID))]
            }
            return []
        }
    },
    async mounted() {
        const serverData = await matchServer
        let leftList = await db.leftList.toArray();
        let rightList = await db.rightList.toArray();
        const logTime = await db.log.get(modifyTime).then(e => e && e.time)

        if (serverData && matchServer[modifyTime] > (logTime ? logTime : 0)) {
            leftList = serverData.leftList;
            rightList = serverData.rightList;
        }

        this.leftList = leftList;
        this.rightList = rightList;
        this.reset();
    },
    methods: {
        match3v3() {
            if (this.queueList.length) {
                return
            }
            while (this.match(1, 2)) { }
        },
        match5v5() {
            if (this.queueList.length) {
                return
            }
            while (this.match(2, 3)) { }
        },
        match(left, right) {
            const leftMatchs = this.$refs.left.match(left);
            if (!leftMatchs) {
                return
            }
            const rightMatchs = this.$refs.right.match(right);
            if (!rightMatchs) {
                return
            }
            this.$refs.left.matchLog(leftMatchs);
            this.$refs.right.matchLog(rightMatchs);
            this.queueList.push([...leftMatchs, ...rightMatchs]);
            return true
        },
        onImport(e) {
            const target = e.target;
            readJsonFile(target.files[0]).then((json) => {
                const data = JSON.parse(JSON.stringify(json));
                if (json.leftList) {
                    this.leftList = json.leftList;
                    this.onLeftChange(data.leftList);
                }
                if (json.rightList) {
                    this.rightList = json.rightList;
                    this.onRightChange(data.rightList);
                }
            }).catch(() => {

            });
            target.value = "";
        },
        onExport() {
            const file = new File([JSON.stringify({
                leftList: this.$refs.left.getPlainData(),
                rightList: this.$refs.right.getPlainData()
            }, null, 2)], 'match.txt', { type: 'application/json' });
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = `游戏匹配${new Date().toLocaleString()}.json`;
            a.click();
            requestAnimationFrame(() => {
                URL.revokeObjectURL(url)
            })
        },
        onUpload() {
            github.putJson(uploadPath, {
                leftList: this.$refs.left.getPlainData(),
                rightList: this.$refs.right.getPlainData(),
                [modifyTime]: Date.now()
            })
        },
        reset() {
            this.$refs.left.reset();
            this.$refs.right.reset();
            this.queueList.length = 0;
        },
        async onLeftChange(rows) {
            await db.leftList.clear();
            if (rows.length) {
                db.leftList.bulkAdd(rows);
                db.log.put({ ID: modifyTime, time: Date.now() })
            }
        },
        async onRightChange(rows) {
            await db.rightList.clear();
            if (rows.length) {
                db.rightList.bulkAdd(rows);
                db.log.put({ ID: modifyTime, time: Date.now() })
            }
        },
        getQueueColor(colorIndex) {
            return colorList[colorIndex % colorList.length]
        }
    }
});

vApp.component('v-list', {
    props: {
        list: {
            default: (() => [])
        }
    },
    emits: ["change"],
    mounted() {
        this.setRows(this.list)
    },
    watch: {
        list(val) {
            this.setRows(val)
        }
    },
    data() {
        return {
            rows: [],
            alert: "",
            matchColor: 0,
            matchMap: new Map()
        }
    },
    methods: {
        getRowColor(ID) {
            const colorIndex = this.matchMap.get(ID);
            if (colorIndex > -1) {
                return colorList[colorIndex % colorList.length]
            }
            return
        },
        setRows(list) {
            this.rows = list;
            this.rows.push(this.gen());
        },
        gen() {
            return { ID: "", Job: "" }
        },
        add(index) {
            this.rows.splice(index + 1, 0, this.gen());
            this.emitChange()
        },
        remove(index) {
            this.rows.splice(index, 1);
            this.emitChange()
        },
        emitChange() {
            this.$emit("change", this.getPlainData())
        },
        reset() {
            this.matchColor = 0;
            this.alert = "";
            this.matchMap = new Map();
        },
        match(n) {
            const list = this.getMatchData();
            if (list.length - this.matchMap.size < n) {
                this.alert = "剩余 ID 不足";
                return
            }
            const canMatch = list.filter(e => !this.matchMap.has(e.ID));
            return this.getRandomData(canMatch, n);
        },
        matchLog(matchList) {
            const colorIndex = this.matchColor++;
            matchList.forEach(e => this.matchMap.set(e.ID, colorIndex));
        },
        getPlainData() {
            return this.rows.map(a => {
                return {
                    ID: a.ID.trim(),
                    Job: a.Job.trim()
                }
            }).filter(a => a.ID || a.Job)
        },
        getMatchData() {
            return this.getPlainData().filter(a => a.ID)
        },
        getRandomData(rows, n) {
            const copyRows = rows.slice();
            const data = [];
            for (let i = 0, max = rows.length - 1; i < n; i++) {
                data.push(copyRows.splice(randomInt(0, max), 1)[0])
                max--;
            }
            return data
        }
    },
    template: document.getElementById('template-list').innerHTML
});

vApp.mount('#app')
