import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren, TargetedDragEvent, TargetedPointerEvent, TargetedSubmitEvent } from 'preact'
import { AnalysisClient } from './analysis'
import { loadEngine } from './engine'
import {
  advanceSession, canSelect, cardName, createSession, describeAction, elapsedSeconds,
  entriesFor, formatTime, moveTo, parseSeed, pileKey, pileName, pilesFor, randomSeed,
  rankLabels, samePile, suitSymbols, undoSession,
} from './game'
import type { Action, Analysis, Card, Engine, Pile, Selection, Session } from './game'
import './app.css'

function Icon({ name, size = 18 }: { name: 'plus' | 'hint' | 'clock' | 'arrow' | 'close' | 'check' | 'undo'; size?: number }) {
  const paths = {
    plus: 'M12 5v14M5 12h14', hint: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
    clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    arrow: 'M5 12h14m-6-6 6 6-6 6', close: 'm6 6 12 12M6 18 18 6', check: 'm5 12 4 4L19 6',
    undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

function Face({ card }: { card: Card }) {
  const symbol = suitSymbols[card.suit]
  return <>
    <span class="card-corner"><span>{rankLabels[card.rank]}</span><span>{symbol}</span></span>
    <span class="card-suit">{symbol}</span>
    <span class="card-corner card-corner-bottom"><span>{rankLabels[card.rank]}</span><span>{symbol}</span></span>
  </>
}

function Modal({ titleId, onClose, children, className = '' }: {
  titleId: string; onClose?: () => void; children: ComponentChildren; className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const previous = document.activeElement
    const dialog = ref.current!
    dialog.showModal()
    return () => {
      dialog.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  return <dialog ref={ref} class={`modal ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose?.() }}>
    {onClose && <button class="close-button" type="button" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button>}
    {children}
  </dialog>
}

function NewGameDialog({ catalog, current, onStart, onClose }: {
  catalog: [string, string][]; current: Session | null
  onStart: (id: string, seed: bigint) => void; onClose?: () => void
}) {
  const [gameId, setGameId] = useState(current?.gameId ?? catalog[0][0])
  const [seedText, setSeedText] = useState('')
  const [error, setError] = useState('')
  const seedRef = useRef<HTMLInputElement>(null)
  const submit = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    let seed: bigint | null
    try { seed = parseSeed(seedText) }
    catch (error) {
      setError(error instanceof Error ? error.message : 'Check your seed.')
      seedRef.current?.focus()
      return
    }
    try { onStart(gameId, seed ?? randomSeed(current?.seed)) }
    catch (error) { setError(error instanceof Error ? error.message : 'The deal could not start.') }
  }
  return <Modal titleId="new-game-title" onClose={onClose}>
    <h2 id="new-game-title">New Game</h2>
    <form onSubmit={submit}>
      <label for="game">Game</label>
      <div class="select-wrap"><select id="game" name="game" value={gameId} onChange={event => setGameId(event.currentTarget.value)}>
        {catalog.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></div>
      <div class="seed-label"><label for="seed">Deal seed <span class="optional">optional</span></label></div>
      <input ref={seedRef} id="seed" name="seed" type="text" inputMode="numeric" autoComplete="off" placeholder="Random"
        value={seedText} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'seed-error' : undefined}
        onInput={event => { setSeedText(event.currentTarget.value); setError('') }} />
      <p class="form-error" id="seed-error" role="alert">{error}</p>
      <button class="button button-primary start-button" type="submit">Start <Icon name="arrow" /></button>
      {current && <button class="button button-text cancel-button" type="button" onClick={onClose}>Cancel</button>}
    </form>
  </Modal>
}

function WinDialog({ session, onNew, onDeal, onClose, onUndo }: {
  session: Session; onNew: () => void; onDeal: () => void; onClose: () => void; onUndo: () => void
}) {
  return <Modal titleId="win-title" className="win-modal" onClose={onClose}>
    <div class="win-symbol" aria-hidden="true">♠<span>✧</span></div>
    <h2 id="win-title">You win!</h2>
    <div class="result-game">{session.name}</div>
    <div class="result-stats"><div><span>TIME</span><strong>{formatTime(elapsedSeconds(session))}</strong></div><div><span>MOVES</span><strong>{session.turns}</strong></div></div>
    <p class="result-seed">DEAL SEED <span>{session.seed.toString()}</span></p>
    <button class="button button-primary start-button" type="button" onClick={onDeal}>Another deal <Icon name="arrow" /></button>
    <button class="button button-text cancel-button" type="button" onClick={onNew}>New Game</button>
    <button class="button button-text cancel-button" type="button" onClick={onUndo} disabled={!session.history.length}><Icon name="undo" size={16} />Undo last move</button>
  </Modal>
}

function BoardPile({ session, pile, selection, hint, dragging, onCard, onDraw, onDrag, onDragEnd, onDrop, onPointerDown }: {
  session: Session; pile: Pile; selection: Selection | null; hint: Action | null; dragging: boolean
  onCard: (pile: Pile, count: number) => void; onDraw: () => void
  onDrag: (event: TargetedDragEvent<HTMLButtonElement>, pile: Pile, count: number) => void
  onDragEnd: () => void; onDrop: (event: TargetedDragEvent<HTMLDivElement>, pile: Pile) => void
  onPointerDown: (event: TargetedPointerEvent<HTMLButtonElement>, pile: Pile, count: number) => void
}) {
  const entries = entriesFor(session.board, pile)
  const group = pile.contents[0]
  const tableau = group === 'Tableau'
  const stock = group === 'Stock'
  const targetAction = selection ? moveTo(session.actions, selection, pile) : undefined
  const target = !!targetAction
  const hintTarget = hint?.$tag === 'Move' && samePile(hint.contents[2], pile)
  const hintSource = hint?.$tag === 'Move' && samePile(hint.contents[1], pile)
  const hintDraw = hint?.$tag === 'Draw' && stock
  const drawAvailable = session.actions.some(action => action.$tag === 'Draw')
  const displayed = (tableau ? entries.map((entry, index) => ({ entry, index })).reverse()
    : entries.slice(0, 1).map((entry, index) => ({ entry, index })))
  const cardCount = tableau ? Math.max(entries.length - 1, 0) : 0
  const name = pileName(pile)
  return <div class={`pile ${tableau ? 'tableau-pile' : ''} ${target ? 'is-target' : ''} ${hintTarget ? 'hint-target' : ''} ${hintDraw ? 'hint-source' : ''}`}
    data-pile={pileKey(pile)} role="group" aria-label={name}
    onDragEnter={event => { if (dragging && target) event.preventDefault() }}
    onDragOver={event => { if (dragging && target) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move' } }}
    onDrop={event => onDrop(event, pile)}>
    <div class="pile-heading">{tableau ? String(pile.contents[1]).padStart(2, '0') : group === 'Foundation' ? String(pile.contents[1]).padStart(2, '0') : group === 'Cell' ? `CELL ${pile.contents[1]}` : group.toUpperCase()}</div>
    <div class={`pile-stack ${tableau ? 'tableau-stack' : ''}`} style={{ '--stack-count': cardCount }}>
      {entries.length === 0 && <button type="button" class={`empty-slot ${hintDraw ? 'is-hint' : ''}`} disabled={stock ? !drawAvailable : !target}
        aria-label={stock ? 'Recycle stock' : target ? `Move selected cards to empty ${name}` : `Empty ${name}`}
        onClick={() => stock ? onDraw() : onCard(pile, 0)}>
        <span aria-hidden="true">{stock ? '↻' : group === 'Foundation' ? '♠' : group === 'Cell' ? '＋' : '♧'}</span>
        {target && <span class="target-caption">MOVE HERE</span>}
        {stock && <span class="slot-caption">{drawAvailable ? 'RECYCLE' : 'EMPTY'}</span>}
      </button>}
      {displayed.map(({ entry, index }, position) => {
        const [face, card] = entry.contents
        const down = stock || face === 'Down'
        const count = index + 1
        const movable = !down && canSelect(session.actions, pile, count)
        const selected = !!selection && samePile(selection.pile, pile) && index < selection.count
        const hinted = hintSource && hint?.$tag === 'Move' && index < hint.contents[0]
        const enabled = stock ? drawAvailable : !down && (movable || target && index === 0)
        const label = stock ? `Draw from stock, ${entries.length} cards remaining` : down ? `Face-down card in ${name}`
          : target && index === 0 ? `Move selected cards to ${name}, ${cardName(card)}`
            : `${cardName(card)} in ${name}${tableau && count > 1 ? `, select ${count} cards` : ''}`
        return <button key={`${pileKey(pile)}:${index}`} type="button"
          class={`card ${down ? 'card-back' : ''} ${!down && (card.suit === 'Hearts' || card.suit === 'Diamonds') ? 'card-red' : ''} ${selected ? 'is-selected' : ''} ${hinted ? 'is-hint' : ''}`}
          style={tableau ? { top: `calc(${position} * var(--card-overlap))` } : undefined}
          disabled={!enabled} draggable={movable} aria-label={label} aria-pressed={!down && movable ? selected : undefined}
          onClick={() => stock ? onDraw() : onCard(pile, count)}
          onPointerDown={event => onPointerDown(event, pile, count)}
          onContextMenu={event => { if (movable) event.preventDefault() }}
          onDragStart={event => onDrag(event, pile, count)} onDragEnd={onDragEnd}>
          {down ? <span class="back-pattern" aria-hidden="true"><span>♠</span></span> : <span aria-hidden="true"><Face card={card} /></span>}
          {target && index === 0 && <span class="target-marker" aria-hidden="true">↳</span>}
        </button>
      })}
    </div>
    {!tableau && <span class="pile-count">{stock ? `${entries.length} cards` : group === 'Foundation' && entries.length ? `${entries.length} collected` : '\u00a0'}</span>}
  </div>
}

function Table({ session, selection, hint, dragging, onCard, onDraw, onDrag, onDragEnd, onDrop, onTouchDrag, onTouchDrop }: Omit<Parameters<typeof BoardPile>[0], 'pile' | 'onPointerDown'> & {
  onTouchDrag: (pile: Pile, count: number) => void; onTouchDrop: (pile: Pile) => void
}) {
  const stocks = pilesFor(session.board, 'Stock')
  const waste = pilesFor(session.board, 'Waste')
  const cells = pilesFor(session.board, 'Cell')
  const foundations = pilesFor(session.board, 'Foundation')
  const tableaus = pilesFor(session.board, 'Tableau')
  const touch = useRef<{
    pointerId: number; pile: Pile; count: number; x: number; y: number
    offsetX: number; offsetY: number; active: boolean
  } | null>(null)
  const [preview, setPreview] = useState<{ pile: Pile; count: number; x: number; y: number } | null>(null)
  useEffect(() => { touch.current = null; setPreview(null) }, [session.revision])

  function pointerDown(event: TargetedPointerEvent<HTMLButtonElement>, pile: Pile, count: number) {
    if (event.pointerType === 'mouse' || !event.isPrimary || event.button !== 0 || !canSelect(session.actions, pile, count)) return
    const rect = event.currentTarget.getBoundingClientRect()
    touch.current = { pointerId: event.pointerId, pile, count, x: event.clientX, y: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, active: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function pointerMove(event: TargetedPointerEvent<HTMLDivElement>) {
    const drag = touch.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return
    event.preventDefault()
    if (!drag.active) { drag.active = true; onTouchDrag(drag.pile, drag.count) }
    setPreview({ pile: drag.pile, count: drag.count, x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY })
  }

  function pointerEnd(event: TargetedPointerEvent<HTMLDivElement>) {
    const drag = touch.current
    if (!drag || drag.pointerId !== event.pointerId) return
    touch.current = null
    setPreview(null)
    if (!drag.active) return
    event.preventDefault()
    const key = event.type === 'pointerup' ? document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-pile]')?.getAttribute('data-pile') : null
    const target = [...stocks, ...waste, ...cells, ...foundations, ...tableaus].find(pile => pileKey(pile) === key)
    if (target) onTouchDrop(target)
    else onDragEnd()
  }

  const props = { session, selection, hint, dragging, onCard, onDraw, onDrag, onDragEnd, onDrop, onPointerDown: pointerDown }
  const renderPile = (pile: Pile) => <BoardPile key={pileKey(pile)} {...props} pile={pile} />
  const reserveColumns = stocks.length + waste.length + cells.length + (foundations.length === 12 ? 6 : foundations.length)
  return <div class="board-scroll" tabIndex={0} role="region" aria-label="Card table"
    onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}>
    <div class={`board-layout ${session.gameId === 'grandfathers-clock' ? 'clock-layout' : ''}`}
      style={{ '--columns': tableaus.length, '--layout-columns': Math.max(tableaus.length, reserveColumns) }}>
      <div class="reserve-row">
        <div class="reserve-piles">{[...stocks, ...waste, ...cells].map(renderPile)}</div>
        {foundations.length > 0 && <div class={`foundation-piles ${foundations.length === 12 ? 'clock-foundations' : ''}`} aria-label="Foundations">{foundations.map(renderPile)}</div>}
      </div>
      <div class="tableau-row">{tableaus.map(renderPile)}</div>
      {preview && <div class="touch-drag-preview" aria-hidden="true" style={{ left: `${preview.x}px`, top: `${preview.y}px` }}>
        {entriesFor(session.board, preview.pile).slice(0, preview.count).reverse().map((entry, index) => <div
          class={`card ${entry.contents[1].suit === 'Hearts' || entry.contents[1].suit === 'Diamonds' ? 'card-red' : ''}`}
          style={{ top: `calc(${index} * var(--card-overlap))` }}><Face card={entry.contents[1]} /></div>)}
      </div>}
    </div>
  </div>
}

export function App() {
  const [engine, setEngine] = useState<Engine | null>(null)
  const [catalog, setCatalog] = useState<[string, string][]>([])
  const [loadError, setLoadError] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const [dialog, setDialog] = useState<'new' | 'win' | null>('new')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [hint, setHint] = useState<Action | null>(null)
  const [analysis, setAnalysis] = useState<Analysis>({ status: 'idle' })
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ selection: Selection; revision: number } | null>(null)
  const suppressClick = useRef(false)
  const tableTitleRef = useRef<HTMLHeadingElement>(null)
  const client = useRef<AnalysisClient | null>(null)
  if (!client.current) client.current = new AnalysisClient(() => new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' }))

  useEffect(() => {
    let disposed = false
    loadEngine().then(value => {
      if (!disposed) { setCatalog(value.games()); setEngine(value) }
    }).catch(error => { if (!disposed) setLoadError(error instanceof Error ? error.message : 'The game engine could not load.') })
    return () => { disposed = true; client.current?.cancel() }
  }, [])

  useEffect(() => {
    if (!session) return
    document.title = `${session.name} — Solitaire`
    if (session.finishedAt !== null) { setAnalysis({ status: 'solved', path: [] }); return }
    const revision = session.revision
    client.current!.search(session.gameId, session.board, revision, result => {
      if (sessionRef.current?.revision === revision) setAnalysis(result)
    })
    return () => client.current?.cancel()
  }, [session])

  useEffect(() => {
    if (!session || session.finishedAt !== null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session?.startedAt, session?.finishedAt])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelection(null); setHint(null) }
      if (event.defaultPrevented || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
      if (dialog === 'new' || !sessionRef.current?.history.length || dragRef.current) return
      event.preventDefault()
      undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [engine, dialog])

  function commit(next: Session) {
    client.current?.cancel()
    sessionRef.current = next
    setSession(next)
    setNow(Date.now())
    setSelection(null)
    setHint(null)
    setError('')
    dragRef.current = null
    setDragging(false)
    setAnalysis(next.finishedAt !== null ? { status: 'solved', path: [] } : { status: 'analyzing' })
    setDialog(next.finishedAt !== null ? 'win' : null)
  }

  function start(gameId: string, seed: bigint) {
    if (!engine) return
    const name = catalog.find(([id]) => id === gameId)?.[1] ?? gameId
    commit(createSession(engine, gameId, name, seed, (sessionRef.current?.revision ?? 0) + 1))
    requestAnimationFrame(() => tableTitleRef.current?.focus())
  }

  function play(action: Action) {
    const current = sessionRef.current
    if (!engine || !current || dialog) return
    try { commit(advanceSession(engine, current, action)) }
    catch (error) { setError(error instanceof Error ? error.message : 'The move could not be made.') }
  }

  function undo() {
    const current = sessionRef.current
    if (!engine || !current?.history.length || dialog === 'new' || dragRef.current) return
    try { commit(undoSession(engine, current)) }
    catch (error) { setError(error instanceof Error ? error.message : 'The move could not be undone.') }
  }

  function choose(pile: Pile, count: number) {
    if (suppressClick.current || !session || dialog) return
    if (selection) {
      const action = moveTo(session.actions, selection, pile)
      if (action) { play(action); return }
      if (samePile(selection.pile, pile) && selection.count === count) { setSelection(null); setHint(null); return }
    }
    if (canSelect(session.actions, pile, count)) { setSelection({ pile, count }); setHint(null) }
  }

  function beginDrag(event: TargetedDragEvent<HTMLButtonElement>, pile: Pile, count: number) {
    if (!session || !canSelect(session.actions, pile, count) || !event.dataTransfer || dialog) { event.preventDefault(); return }
    activateDrag(pile, count)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', 'solitaire-card')
  }

  function activateDrag(pile: Pile, count: number) {
    if (!session || dialog) return
    const next = { pile, count }
    dragRef.current = { selection: next, revision: session.revision }
    setSelection(next)
    setHint(null)
    setDragging(true)
    suppressClick.current = true
  }

  function endDrag() {
    dragRef.current = null
    setDragging(false)
    // Some browsers synthesize a click at the end of a drag.
    setTimeout(() => { suppressClick.current = false }, 0)
  }

  function drop(event: TargetedDragEvent<HTMLDivElement>, pile: Pile) {
    event.preventDefault()
    dropOn(pile)
  }

  function dropOn(pile: Pile) {
    const drag = dragRef.current
    if (!drag || !session || drag.revision !== session.revision) return
    const action = moveTo(session.actions, drag.selection, pile)
    if (action) play(action)
    endDrag()
  }

  function showHint() {
    if (analysis.status !== 'solved' || !analysis.path.length || !session) return
    setSelection(null)
    setHint(analysis.path[0])
    const target = analysis.path[0].$tag === 'Move' ? analysis.path[0].contents[1] : pilesFor(session.board, 'Stock')[0]
    if (target) document.querySelector<HTMLElement>(`[data-pile="${pileKey(target)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  const analysisLabels = { idle: 'Choose a deal to begin', analyzing: 'Analyzing…', solved: 'Winning path found', impossible: 'No winning path', unknown: 'Unable to determine', error: 'Analysis unavailable' }
  const selectionText = selection ? `${selection.count} card${selection.count === 1 ? '' : 's'} selected.` : ''
  const hintText = hint && session ? describeAction(session.board, hint) : ''
  const hintAvailable = analysis.status === 'solved' && analysis.path.length > 0 && !!session && session.finishedAt === null

  return <main class="app-shell">
    <section class="game-table" aria-label="Solitaire game">
      <div class="table-toolbar">
        <div class="game-heading"><h1 tabIndex={-1} ref={tableTitleRef}>{session?.name ?? 'Solitaire'}</h1>
          {session && <p class="deal-seed">DEAL <span>#{session.seed.toString()}</span></p>}
        </div>
        <div class="toolbar-right">
          {session && <div class="game-stats"><div class="stat"><Icon name="clock" size={15} /><span class="sr-only">Elapsed time </span><span>{formatTime(elapsedSeconds(session, now))}</span></div><span class="stat-divider" /><div class="stat"><span>{session.turns}</span><span class="stat-label">moves</span></div></div>}
          <div class="table-actions"><button type="button" class="button button-table" onClick={undo} disabled={!session?.history.length || dragging} title="Undo (Ctrl/Cmd+Z)" aria-keyshortcuts="Control+z Meta+z"><Icon name="undo" size={16} />Undo</button>
            <button type="button" class="button button-table" onClick={showHint} disabled={!hintAvailable}><Icon name="hint" size={16} />Hint</button>
            <button type="button" class="button button-table button-new" disabled={!engine} onClick={() => { setSelection(null); setHint(null); setDialog('new') }}><Icon name="plus" size={16} />New Game</button></div>
        </div>
      </div>
      {session ? <Table session={session} selection={selection} hint={hint} dragging={dragging} onCard={choose}
        onDraw={() => { const draw = session.actions.find(action => action.$tag === 'Draw'); if (draw) play(draw) }}
        onDrag={beginDrag} onDragEnd={endDrag} onDrop={drop} onTouchDrag={activateDrag} onTouchDrop={dropOn} />
        : <div class="waiting-table">
          {!engine && !loadError && <span class="loading-line" role="status">Loading the game engine</span>}
          {loadError && <div class="load-error" role="alert"><p>The game engine could not load. Reload to try again.</p><details><summary>Details</summary>{loadError}</details><button class="button button-table" type="button" onClick={() => location.reload()}>Reload</button></div>}
        </div>}
      <div class="move-message" role="status" aria-live="polite">{hintText ? <><Icon name="hint" size={16} />{hintText}</> : selectionText || (session && session.finishedAt === null && session.actions.length === 0 ? 'No legal moves remain.' : '')}</div>
      <p class="play-error" role="alert">{error}</p>
      <footer class="table-footer">
        <div class="analysis-status" role="status" aria-live="polite"><span class={`status-symbol status-${analysis.status}`} aria-hidden="true">{analysis.status === 'solved' ? <Icon name="check" size={15} /> : analysis.status === 'analyzing' ? '◌' : '·'}</span><div><span class="analysis-label">Game Status</span><strong>{analysisLabels[analysis.status]}</strong></div></div>
      </footer>
    </section>
    {engine && dialog === 'new' && <NewGameDialog catalog={catalog} current={session} onStart={start} onClose={session ? () => setDialog(session.finishedAt !== null ? 'win' : null) : undefined} />}
    {session && dialog === 'win' && <WinDialog session={session} onNew={() => setDialog('new')} onDeal={() => {
      try { start(session.gameId, randomSeed(session.seed)) }
      catch (error) { setDialog(null); setError(error instanceof Error ? error.message : 'The deal could not start.') }
    }} onClose={() => setDialog(null)} onUndo={undo} />}
  </main>
}
