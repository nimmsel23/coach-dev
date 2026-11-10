#!/usr/bin/env python3
"""Beautiful ncurses menu for selecting from options."""

import curses
from typing import Optional


def select_from_menu(options: list[str], title: str = "Select") -> Optional[str]:
    """ncurses menu for selecting from a list of options.

    Features:
    - ↑↓ Navigate
    - Enter Select
    - / Search
    - Esc/q Cancel
    """
    if not options:
        return None

    if len(options) == 1:
        return options[0]

    try:
        return curses.wrapper(_menu_loop, options, title)
    except Exception:
        # Fallback: if curses fails, use simple input
        return _simple_menu(options, title)


def _menu_loop(stdscr, options: list[str], title: str) -> Optional[str]:
    """Main ncurses menu loop."""
    curses.curs_set(0)  # Hide cursor
    stdscr.clear()

    # Colors
    curses.init_pair(1, curses.COLOR_BLACK, curses.COLOR_WHITE)  # Selected
    curses.init_pair(2, curses.COLOR_CYAN, curses.COLOR_BLACK)   # Search
    curses.init_pair(3, curses.COLOR_GREEN, curses.COLOR_BLACK)  # Status

    selected_idx = 0
    search_term = ""
    filtered_options = options[:]
    filtered_map = {opt: i for i, opt in enumerate(options)}

    while True:
        stdscr.clear()
        height, width = stdscr.getmaxyx()

        # Header
        header = f" {title} "
        stdscr.addstr(0, 0, header, curses.A_BOLD | curses.A_REVERSE)

        # Search bar
        search_line = f"Search: {search_term}{'_' if not search_term else ''}"
        if search_term:
            stdscr.addstr(1, 0, search_line, curses.color_pair(2))
        else:
            stdscr.addstr(1, 0, search_line)

        # Instructions
        instructions = "↑↓ / → Select  |  Enter Confirm  |  / Search  |  Esc Cancel"
        if width > len(instructions):
            stdscr.addstr(2, 0, instructions, curses.A_DIM)

        # Menu items
        y = 4
        visible_count = height - y - 2
        if visible_count < 1:
            visible_count = 1

        # Ensure selected_idx is within bounds
        if selected_idx >= len(filtered_options):
            selected_idx = max(0, len(filtered_options) - 1)

        # Show items
        start_idx = max(0, selected_idx - visible_count // 2)
        end_idx = min(len(filtered_options), start_idx + visible_count)
        if end_idx - start_idx < visible_count:
            start_idx = max(0, end_idx - visible_count)

        for i in range(start_idx, end_idx):
            opt = filtered_options[i]
            display = opt[:width - 4] if len(opt) > width - 4 else opt
            marker = "▶ " if i == selected_idx else "  "

            if i == selected_idx:
                stdscr.addstr(y, 0, marker + display, curses.color_pair(1))
            else:
                stdscr.addstr(y, 0, marker + display)
            y += 1

        # Footer
        footer = f"[{selected_idx + 1}/{len(filtered_options)}]"
        if len(filtered_options) < len(options):
            footer += f" (filtered from {len(options)})"
        stdscr.addstr(height - 1, 0, footer, curses.color_pair(3))

        stdscr.refresh()

        # Input
        try:
            ch = stdscr.getch()
        except KeyboardInterrupt:
            return None

        if ch == ord('q') or ch == 27:  # q or ESC
            return None

        elif ch == ord('/'):  # Search mode
            search_term = _search_prompt(stdscr, height, search_term, options)
            if search_term is not None:
                # Filter options
                search_lower = search_term.lower()
                filtered_options = [opt for opt in options if search_lower in opt.lower()]
                filtered_map = {opt: i for i, opt in enumerate(options) if search_lower in opt.lower()}
                selected_idx = 0
                if not filtered_options:
                    filtered_options = options[:]
                    filtered_map = {opt: i for i, opt in enumerate(options)}
                    search_term = ""

        elif ch == curses.KEY_UP or ch == ord('k'):
            selected_idx = max(0, selected_idx - 1)

        elif ch == curses.KEY_DOWN or ch == ord('j'):
            selected_idx = min(len(filtered_options) - 1, selected_idx + 1)

        elif ch == ord('\n'):  # Enter
            return filtered_options[selected_idx] if filtered_options else None

        elif ch == curses.KEY_HOME:
            selected_idx = 0

        elif ch == curses.KEY_END:
            selected_idx = len(filtered_options) - 1


def _search_prompt(stdscr, height: int, initial: str, options: list[str]) -> Optional[str]:
    """Simple search input."""
    curses.echo()
    curses.curs_set(1)
    search_term = initial
    stdscr.addstr(height - 1, 0, "Type to search (Esc to cancel): " + search_term)
    stdscr.refresh()

    try:
        while True:
            ch = stdscr.getch()
            if ch == 27:  # ESC
                break
            elif ch == curses.KEY_BACKSPACE or ch == 8:
                search_term = search_term[:-1]
            elif 32 <= ch < 127:  # Printable ASCII
                search_term += chr(ch)

            stdscr.addstr(height - 1, 0, "Type to search (Esc to cancel): " + search_term + " " * 20)
            stdscr.refresh()
    except KeyboardInterrupt:
        pass
    finally:
        curses.noecho()
        curses.curs_set(0)

    return search_term if search_term != initial else None


def _simple_menu(options: list[str], title: str = "Select") -> Optional[str]:
    """Fallback: simple numbered menu."""
    print(f"\n{title}:")
    for i, opt in enumerate(options, 1):
        # Truncate long options
        display = opt[:80] if len(opt) > 80 else opt
        print(f"  {i:3d}) {display}")

    while True:
        try:
            choice = input("\nNummer eingeben (oder 'q' zum Abbrechen): ").strip()
            if choice.lower() == 'q':
                return None
            idx = int(choice) - 1
            if 0 <= idx < len(options):
                return options[idx]
            else:
                print(f"  ✗ Bitte Nummer zwischen 1 und {len(options)}")
        except ValueError:
            print(f"  ✗ Ungültige Eingabe")
        except (EOFError, KeyboardInterrupt):
            return None
