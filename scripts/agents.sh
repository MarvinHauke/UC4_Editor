#!/usr/bin/env bash
# Starts and stops the UC4 Editor agent team. Each agent is a peer Claude session defined by
# .claude/agents/<agent>.md: the model comes from its `model:` frontmatter.
# - Agents start FRESH by default (a new session, small context): their agent file, CLAUDE.md and
#   docs/feature-plans/STATUS.md are the hand-over. Each fresh start gets a new session id, stored in
#   .claude/sessions/<agent> (gitignored). --resume continues that stored session instead; use it only
#   for unfinished work, since a long session reloads its whole history.
# - model, protocol, ui and reviewer open as splits in one tmux window "uc4-agents" (tiled)
# - docs is on demand: it only starts when you name it
# - the architect replaces this script in the current pane (your main window); outside tmux the
#   script opens (or attaches to) the tmux session "uc4" and runs there
# - every pane it starts is marked with the tmux pane option @uc4_agent=<name>; an agent counts as
#   running while its marked pane runs something other than a shell (Claude Code renames pane titles
#   after the conversation topic and shows up as a bare `claude` process, so neither identifies it)
# Usage: scripts/agents.sh                    start the default team, fresh (architect in this pane)
#        scripts/agents.sh status             list the agents and where they run
#        scripts/agents.sh docs               add the on-demand docs agent to the agents window
#        scripts/agents.sh model reviewer     start only these (also: protocol, ui, docs, architect)
#        scripts/agents.sh --resume protocol  resume protocol's stored session instead of a fresh one
#        scripts/agents.sh stop ui docs       end these agents (/exit, then close the pane)
#        scripts/agents.sh stop               end every running peer (never the pane you run this in)
#        DRY_RUN=1 scripts/agents.sh ...      print the commands instead of running them
set -euo pipefail
cd "$(dirname "$0")/.."
WINDOW=uc4-agents
MAX_PANES=6
SESSION=uc4
SHELLS=" zsh -zsh bash -bash sh fish "
SESSIONS_DIR=.claude/sessions

# name  agent-file
PEERS=(
    "uc4-model model"
    "uc4-protocol protocol"
    "uc4-ui ui"
    "uc4-reviewer reviewer"
)
# Started only when named on the command line.
ON_DEMAND=(
    "uc4-docs docs"
)
ARCHITECT="uc4-architect architect"

# Outside tmux: run this script inside the tmux session "uc4" (attach if it already exists).
if [ "${DRY_RUN:-}" = "" ] && [ "${TMUX:-}" = "" ]; then
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        echo "tmux session $SESSION exists, attaching (run the script there to start more agents)"
        exec tmux attach -t "$SESSION"
    fi
    exec tmux new-session -s "$SESSION" -c "$PWD" "scripts/agents.sh $*; exec \${SHELL:-zsh}"
fi

session_id() { [ -f "$SESSIONS_DIR/$1" ] && tr -d '[:space:]' <"$SESSIONS_DIR/$1" || true; }
model_of() { sed -n '/^---$/,/^---$/s/^model:[[:space:]]*//p' ".claude/agents/$1.md" | head -1; }
session_exists() { [ -n "$1" ] && ls ~/.claude/projects/*/"$1".jsonl >/dev/null 2>&1; }
named() { [[ " ${ARGS[*]:-} " == *" ${1#uc4-} "* ]]; }
# Default-team members run when no names are given; on-demand agents only when named.
selected() { [ ${#ARGS[@]} -eq 0 ] || named "$1"; }
# pane_of <name>: the pane marked with @uc4_agent=<name> that still runs something (not a shell).
pane_of() {
    tmux list-panes -a -F '#{pane_id}|#{@uc4_agent}|#{pane_current_command}' 2>/dev/null |
        awk -F'|' -v n="$1" -v sh="$SHELLS" '$2 == n && index(sh, " " $3 " ") == 0 {print $1; exit}'
}
mark() { tmux set-option -p -t "$1" @uc4_agent "$2"; }
# Running: a marked pane, or a process started with `-n <name>` (sessions started by hand).
running() { [ -n "$(pane_of "$1")" ] || pgrep -f -- "claude.*-n $1( |\$)" >/dev/null; }
where() { local p; p=$(pane_of "$1"); [ -n "$p" ] && tmux display-message -p -t "$p" '#S:#W pane #{pane_id}' || echo "a process outside the marked panes"; }

# claude_cmd <name> <agent>: a fresh session with a new stored id, or (with --resume) the stored one.
claude_cmd() {
    local id model
    id=$(session_id "$2")
    model=$(model_of "$2")
    if [ "$RESUME" = 1 ] && session_exists "$id"; then
        echo "claude --resume $id --agent $2 -n $1 --model $model --permission-mode auto"
        return
    fi
    [ "$RESUME" = 1 ] && echo "no stored session for $2, starting fresh" >&2
    id=$(uuidgen | tr '[:upper:]' '[:lower:]')
    if [ "${DRY_RUN:-}" = "" ]; then
        mkdir -p "$SESSIONS_DIR"
        echo "$id" >"$SESSIONS_DIR/$2"
    fi
    echo "claude --session-id $id --agent $2 -n $1 --model $model --permission-mode auto"
}

start_peer() {
    local name=$1 agent=$2 cmd panes pane
    if running "$name"; then
        echo "$name is already running ($(where "$name"))"
        return
    fi
    cmd=$(claude_cmd "$name" "$agent")
    if [ "${DRY_RUN:-}" != "" ]; then
        echo "[$WINDOW] $cmd"
        return
    fi
    if ! tmux list-windows -F '#W' | grep -qx "$WINDOW"; then
        pane=$(tmux new-window -d -P -F '#{pane_id}' -n "$WINDOW" -c "$PWD" "$cmd")
    else
        panes=$(tmux list-panes -t "$WINDOW" | wc -l | tr -d ' ')
        if [ "$panes" -ge "$MAX_PANES" ]; then
            echo "$WINDOW already has $MAX_PANES panes, not starting $name"
            return
        fi
        pane=$(tmux split-window -d -P -F '#{pane_id}' -t "$WINDOW" -c "$PWD" "$cmd")
    fi
    mark "$pane" "$name"
    tmux select-layout -t "$WINDOW" tiled >/dev/null
    echo "started $name ($(model_of "$agent"), $([ "$RESUME" = 1 ] && echo resumed || echo fresh))"
}

# stop_agent <name>: send /exit to the agent's marked pane, close it if still there.
stop_agent() {
    local name=$1 pane self
    self=${TMUX_PANE:-}
    pane=$(pane_of "$name")
    if [ -z "$pane" ]; then
        echo "$name is not running"
        return
    fi
    if [ "$pane" = "$self" ]; then
        echo "not stopping $name: it runs in this pane"
        return
    fi
    if [ "${DRY_RUN:-}" != "" ]; then
        echo "[stop] $name in pane $pane"
        return
    fi
    # The prompt runs in vim mode: Esc goes to NORMAL, where "/exit" became e, x, i and a stray "t" was sent.
    # "cc" clears the line and enters INSERT; then /exit is typed literally.
    tmux send-keys -t "$pane" Escape
    sleep 0.4
    tmux send-keys -t "$pane" -l "cc"
    sleep 0.2
    tmux send-keys -t "$pane" -l "/exit"
    sleep 0.2
    tmux send-keys -t "$pane" Enter
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        tmux list-panes -a -F '#{pane_id}' | grep -qx "$pane" || { echo "stopped $name"; return; }
        sleep 0.5
    done
    tmux kill-pane -t "$pane" && echo "stopped $name (pane closed)"
}

RESUME=0
ARGS=()
STOP=0
STATUS=0
for a in "$@"; do
    case "$a" in
        --resume) RESUME=1 ;;
        stop) STOP=1 ;;
        status) STATUS=1 ;;
        *) ARGS+=("$a") ;;
    esac
done

if [ "$STATUS" = 1 ]; then
    for entry in "$ARCHITECT" "${PEERS[@]}" "${ON_DEMAND[@]}"; do
        read -r name agent <<<"$entry"
        if running "$name"; then
            printf '%-16s running  %s\n' "$name" "$(where "$name")"
        else
            printf '%-16s stopped\n' "$name"
        fi
    done
    exit 0
fi

if [ "$STOP" = 1 ]; then
    for entry in "${PEERS[@]}" "${ON_DEMAND[@]}" "$ARCHITECT"; do
        read -r name agent <<<"$entry"
        if [ ${#ARGS[@]} -eq 0 ]; then
            [ "$entry" = "$ARCHITECT" ] && continue   # `stop` alone never stops the architect
            stop_agent "$name"
        elif named "$name"; then
            stop_agent "$name"
        fi
    done
    exit 0
fi

for entry in "${PEERS[@]}"; do
    read -r name agent <<<"$entry"
    selected "$name" && start_peer "$name" "$agent"
done
for entry in "${ON_DEMAND[@]}"; do
    read -r name agent <<<"$entry"
    named "$name" && start_peer "$name" "$agent"
done

read -r name agent <<<"$ARCHITECT"
selected "$name" || exit 0
if running "$name"; then
    echo "$name is already running ($(where "$name")); not starting a second one"
    exit 0
fi
cmd=$(claude_cmd "$name" "$agent")
if [ "${DRY_RUN:-}" != "" ]; then
    echo "[this pane] $cmd"
    exit 0
fi
echo "starting $name in this pane ($(model_of "$agent"), $([ "$RESUME" = 1 ] && echo resumed || echo fresh))"
[ -n "${TMUX_PANE:-}" ] && mark "$TMUX_PANE" "$name"
# shellcheck disable=SC2086 # the command is split into words on purpose (no argument has spaces)
exec $cmd
