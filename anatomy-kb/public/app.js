function app() {
  return {
    tab: 'status',
    health: null,
    syncing: false,
    syncMsg: '',

    statusData: null,
    statusErr: '',

    musclesLoading: false,
    musclesErr: '',
    muscleRows: [],

    gapLoading: false,
    gapErr: '',
    gapRows: [],

    freqLoading: false,
    freqErr: '',
    freqRows: [],

    demandLoading: false,
    demandErr: '',
    demandRows: [],

    sql: '',
    queryLoading: false,
    queryErr: '',
    queryRows: [],
    queryCols: [],
    queryDone: false,

    async init() {
      await this.checkHealth()
      await this.loadStatus()
    },

    async checkHealth() {
      try {
        const r = await fetch('/health')
        this.health = r.ok
      } catch { this.health = false }
    },

    async loadStatus() {
      this.statusErr = ''
      try {
        const r = await fetch('/api/db/status')
        const d = await r.json()
        if (d.ok) this.statusData = d
        else this.statusErr = d.error || 'Fehler'
      } catch (e) { this.statusErr = e.message }
    },

    async syncAll() {
      this.syncing = true
      this.syncMsg = ''
      try {
        const r = await fetch('/api/db/sync', { method: 'POST' })
        const d = await r.json()
        if (d.ok) {
          this.syncMsg = `Sync OK · ${Object.values(d.counts).reduce((a, b) => a + b, 0)} Einträge`
          this.muscleRows = []
          this.gapRows = []
          this.freqRows = []
          await this.loadStatus()
          if (this.tab === 'muscles') await this.loadMuscles()
          if (this.tab === 'gap')     await this.loadGap()
          if (this.tab === 'freq')    await this.loadFreq()
        } else {
          this.syncMsg = 'Sync fehlgeschlagen'
        }
      } catch (e) { this.syncMsg = e.message }
      this.syncing = false
      setTimeout(() => this.syncMsg = '', 4000)
    },

    async _query(sql) {
      const r = await fetch('/api/db/query?sql=' + encodeURIComponent(sql))
      return r.json()
    },

    async loadMuscles() {
      if (this.muscleRows.length) return
      this.musclesLoading = true
      this.musclesErr = ''
      try {
        const d = await this._query('SELECT muscle_id, latin, has_anatomy, exercise_count, score_rate, last_flashcard FROM muscle_coverage ORDER BY score_rate')
        if (d.ok) this.muscleRows = d.rows
        else this.musclesErr = d.error || 'Fehler'
      } catch (e) { this.musclesErr = e.message }
      this.musclesLoading = false
    },

    async loadGap() {
      if (this.gapRows.length) return
      this.gapLoading = true
      this.gapErr = ''
      try {
        const d = await this._query('SELECT muscle_id, latin, score_rate, last_flashcard, exercise_count FROM weak_muscles')
        if (d.ok) this.gapRows = d.rows
        else this.gapErr = d.error || 'Fehler'
      } catch (e) { this.gapErr = e.message }
      this.gapLoading = false
    },

    async loadFreq() {
      if (this.freqRows.length) return
      this.freqLoading = true
      this.freqErr = ''
      try {
        const d = await this._query('SELECT muscle_id, latin, role, session_days, total_sets, last_trained FROM muscle_training_freq ORDER BY session_days DESC')
        if (d.ok) this.freqRows = d.rows
        else this.freqErr = d.error || 'Fehler'
      } catch (e) { this.freqErr = e.message }
      this.freqLoading = false
    },

    async loadDemand() {
      if (this.demandRows.length) return
      this.demandLoading = true
      this.demandErr = ''
      try {
        const d = await this._query('SELECT e.exercise_id, e.name, COUNT(*) as usage_count FROM training_sessions ts JOIN exercises e ON ts.exercise_id = e.exercise_id WHERE e.unreviewed = 1 GROUP BY e.exercise_id ORDER BY usage_count DESC LIMIT 10')
        if (d.ok) this.demandRows = d.rows
        else this.demandErr = d.error || 'Fehler'
      } catch (e) { this.demandErr = e.message }
      this.demandLoading = false
    },

    setSql(q) { this.sql = q },

    async runQuery() {
      this.queryLoading = true
      this.queryErr = ''
      this.queryRows = []
      this.queryCols = []
      this.queryDone = false
      try {
        const d = await this._query(this.sql.trim())
        if (d.ok) {
          this.queryRows = d.rows
          this.queryCols = d.rows.length ? Object.keys(d.rows[0]) : []
        } else {
          this.queryErr = d.error || 'Fehler'
        }
      } catch (e) { this.queryErr = e.message }
      this.queryLoading = false
      this.queryDone = true
    },
  }
}
