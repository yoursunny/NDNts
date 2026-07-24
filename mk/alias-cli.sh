#
# Activate bash aliases for CLI commands (e.g. ndncat) defined within the codebase.
# This shall be called as:
#   source mk/alias-cli.sh

while read -r SCRIPT_REL; do
  SCRIPT_ABS=$(realpath "$SCRIPT_REL")
  SCRIPT_CMD=$(basename "$SCRIPT_REL")
  SCRIPT_CMD="${SCRIPT_CMD%.sh}"
  eval "$SCRIPT_CMD() { bash \"$SCRIPT_ABS\" \"\$@\" ; }"
  export -f "$SCRIPT_CMD"
done < <(git grep -l loader-import.mjs "$(dirname "${BASH_SOURCE[0]}")"/../pkg)
unset SCRIPT_REL SCRIPT_ABS SCRIPT_CMD
