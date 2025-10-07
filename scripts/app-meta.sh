#!/bin/bash

# Meta utility script for .app-meta file
# Usage: app-meta.sh {set|get} <var-key> [value]
#
# Examples:
#   app-meta.sh get Last-Commit-Id
#   app-meta.sh set Last-Commit-Id "abc123def456"
#   app-meta.sh set Last-Sync-At "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

set -e  # Exit on error

# Configuration
META_FILE="${META_FILE:-.app-meta}"
ORDERED_KEYS=(
    "Production-Last-Commit-Id"
    "Development-Last-Commit-Id"
)

# Function to show usage
usage() {
    echo "Usage: $0 {get|set} <var-key> [value]"
    echo ""
    echo "Commands:"
    echo "  get <key>        Get value for key (returns empty string if missing)"
    echo "  set <key> <val>  Set value for key (maintains order)"
    echo ""
    echo "Examples:"
    echo "  $0 get Last-Commit-Id"
    echo "  $0 set Last-Commit-Id 'abc123def456'"
    echo "  $0 set Last-Sync-At '\$(date -u +\"%Y-%m-%dT%H:%M:%SZ\")'"
    echo ""
    echo "Environment variables:"
    echo "  META_FILE        Path to meta file (default: .app-meta)"
    exit 1
}

# Function to get a value from meta file
get_meta() {
    local key="$1"

    if [[ -f "$META_FILE" ]]; then
        grep "^${key}:" "$META_FILE" 2>/dev/null | cut -d' ' -f2- | head -n1 || echo ""
    else
        echo ""
    fi
}

# Function to set a value in meta file
set_meta() {
    local key="$1"
    local value="$2"

    # Create temp file
    local temp_file=$(mktemp)

    # If file doesn't exist, create it with just this key-value
    if [[ ! -f "$META_FILE" ]]; then
        echo "$key: $value" > "$META_FILE"
        return 0
    fi

    # Read existing content into associative array
    declare -A meta_data
    while IFS= read -r line; do
        if [[ -n "$line" && "$line" == *":"* ]]; then
            local existing_key=$(echo "$line" | cut -d':' -f1 | xargs)
            local existing_value=$(echo "$line" | cut -d':' -f2- | xargs)
            meta_data["$existing_key"]="$existing_value"
        fi
    done < "$META_FILE"

    # Set/update the new key-value pair
    meta_data["$key"]="$value"

    # Write in the specified order
    for ordered_key in "${ORDERED_KEYS[@]}"; do
        if [[ -n "${meta_data[$ordered_key]:-}" ]]; then
            echo "$ordered_key: ${meta_data[$ordered_key]}" >> "$temp_file"
        fi
    done

    # Add any other keys that aren't in the ordered list
    for meta_key in "${!meta_data[@]}"; do
        local found=false
        for ordered_key in "${ORDERED_KEYS[@]}"; do
            if [[ "$meta_key" == "$ordered_key" ]]; then
                found=true
                break
            fi
        done

        if [[ "$found" == false ]]; then
            echo "$meta_key: ${meta_data[$meta_key]}" >> "$temp_file"
        fi
    done

    # Replace original file
    mv "$temp_file" "$META_FILE"
}

# Main script logic
main() {
    # Check arguments
    if [[ $# -lt 2 ]]; then
        echo "Error: Missing required arguments" >&2
        usage
    fi

    local command="$1"
    local key="$2"

    case "$command" in
        get)
            if [[ $# -ne 2 ]]; then
                echo "Error: 'get' command requires exactly one key argument" >&2
                usage
            fi
            get_meta "$key"
            ;;
        set)
            if [[ $# -ne 3 ]]; then
                echo "Error: 'set' command requires key and value arguments" >&2
                usage
            fi
            local value="$3"
            set_meta "$key" "$value"
            ;;
        *)
            echo "Error: Unknown command '$command'" >&2
            usage
            ;;
    esac
}

# Run main function with all arguments
main "$@"
