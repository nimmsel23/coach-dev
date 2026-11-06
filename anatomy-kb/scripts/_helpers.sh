#!/usr/bin/env bash
# _helpers.sh — UI & Logging Helpers für Bash-Skripte

have_gum() { command -v gum >/dev/null 2>&1; }

# Logging
log_info()  { have_gum && gum log --level info  "$*" || printf '\033[1;32m  %s\033[0m\n' "$*"; }
log_warn() { have_gum && gum log --level warn  "$*" >&2 || printf '\033[1;33m  %s\033[0m\n' "$*" >&2; }
log_error()  { have_gum && gum log --level error "$*" >&2 || printf '\033[1;31m  %s\033[0m\n' "$*" >&2; }
die()  { log_error "$*"; exit 1; }

# UI Components
print_header() {
    local title="$1"
    if have_gum; then
        gum style --foreground 212 --border-foreground 212 --border double --align center --width 50 "$title"
    else
        echo "=================================================="
        echo "  $title"
        echo "=================================================="
    fi
}

render_table() {
    local header="$1"
    local data="$2"
    if have_gum; then
        printf "%b\n%b\n" "$header" "$data" | gum table --print --separator=$'\t'
    else
        printf "  %b\n" "$header" | tr '\t' ' '
        printf "  %b\n" "$data" | tr '\t' ' '
    fi
}

confirm_action() {
    local msg="$1"
    if have_gum; then
        gum confirm "$msg"
    else
        read -p "  $msg [y/N] " -n 1 -r
        echo
        [[ $REPLY =~ ^[Yy]$ ]]
    fi
}
