import { createApp } from "https://unpkg.com/vue@next/dist/vue.esm-browser.prod.js"
import Dexie from "https://unpkg.com/dexie@latest/dist/modern/dexie.min.mjs"
import GithubCloud from "https://drc-git.github.io/scripts/github.js"
import { aesDecryptUrlKey } from "https://drc-git.github.io/scripts/aes.js"

const ciphertext = "WyLwuMrGPK1t4uvL27lcYlx1MDAwZq6OIiwirVlcdTAwMDIm6vq1fVxibSpxcWaZz1x1MDAwMWRcIiqNXHUwMDFitU+Iv/3HkNclXHUwMDA3SYR8i4tFXFxcdTAwMWSZXCLe53t4Rb0iXQ==";
const Authorization = await aesDecryptUrlKey(ciphertext, location.search.slice(1));
const modifyTime = 'modifyTime';
const uploadPath = 'jx3/match.json';
const colorList = ["#9e9e9e", "#ff9800", "#ffc107", "#795548", "#ffeb3b", "#cddc39", "#4caf50", "#00bcd4", "#03a9f4", "#9c27b0"];
const github = new GithubCloud({
    owner: "drc-git",
    repo: "store",
    Authorization
});
const db = new Dexie('match');

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

function getRandomRows(rows, n) {
    const data = [];
    for (let i = 0; i < n; i++) {
        data.push(rows.splice(randomInt(0, rows.length - 1), 1)[0])
    }
    return data
}

const vApp = createApp({
    data() {
        return {
            leftList: [],
            rightList: [],
            queueList: []
        }
    },
    computed: {
        otherList() {
            if (this.queueList.length) {
                const set = new Set();
                this.queueList.forEach(list => list.forEach(t => t.queue.forEach(e => set.add(e.ID))));
                return this.leftList.filter(e => e.ID.trim()).concat(this.rightList.filter(e => e.ID.trim())).filter(e => !set.has(e.ID))
            }
            return []
        }
    },
    beforeCreate() {
        db.version(2).stores({
            leftList: 'ID',
            rightList: 'ID',
            log: 'ID'
        })
    },
    async mounted() {
        const serverData = await github.getJson(uploadPath);
        let leftList = await db.leftList.toArray();
        let rightList = await db.rightList.toArray();
        const logTime = await db.log.get(modifyTime).then(e => e && e.time);
        if (serverData && serverData[modifyTime] > (logTime ? logTime : 0)) {
            leftList = serverData.leftList;
            rightList = serverData.rightList
        }
        this.leftList = leftList;
        this.rightList = rightList;
        this.reset()
    },
    methods: {
        match3v3() {
            this.matchT(1, 2)
        },
        match5v5() {
            this.matchT(2, 3)
        },
        matchT(left, right) {
            this.reset();
            const leftList = this.$refs.left.getMatchData();
            const rightList = this.$refs.right.getMatchData();
            const rowCount = Math.floor(Math.min(leftList.length / left, rightList.length / right));
            const leftMatch = this.$refs.left.match(left, rowCount);
            const rightMatch = this.$refs.right.match(right, rowCount);
            const list = leftMatch.map((e, index) => ({
                index,
                queue: e.concat(rightMatch[index])
            }));
            const queueList = [];
            while (list.length > 1) {
                queueList.push(getRandomRows(list, 2))
            }
            this.queueList = queueList
        },
        onImport(e) {
            const target = e.target;
            readJsonFile(target.files[0]).then((json) => {
                const data = JSON.parse(JSON.stringify(json));
                if (json.leftList) {
                    this.leftList = json.leftList;
                    this.onLeftChange(data.leftList)
                }
                if (json.rightList) {
                    this.rightList = json.rightList;
                    this.onRightChange(data.rightList)
                }
            }).catch(() => {
                alert("导入文件错误")
            });
            target.value = ""
        },
        onExport() {
            const file = new File([JSON.stringify({
                leftList: this.$refs.left.getPlainData(),
                rightList: this.$refs.right.getPlainData()
            }, null, 2)], 'match.json', { type: 'application/json' });
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
            this.queueList.length = 0
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
            this.rows.push(this.gen())
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
            this.matchMap = new Map()
        },
        match(n, max) {
            const list = this.getMatchData();
            const rows = [];
            for (let i = 0; i < max; i++) {
                const matchList = getRandomRows(list, n);
                matchList.forEach(e => this.matchMap.set(e.ID, i));
                rows.push(matchList)
            }
            return rows
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
        }
    },
    template: document.getElementById('template-list').innerHTML
});

vApp.mount('#app')
