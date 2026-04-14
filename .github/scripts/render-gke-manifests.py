import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Render the GKE platform manifest template.")
    parser.add_argument("--template", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--value",
        action="append",
        default=[],
        help="Replacement in the form KEY=VALUE. The template token must be __KEY__.",
    )
    args = parser.parse_args()

    content = Path(args.template).read_text(encoding="utf-8")

    for raw in args.value:
        key, value = raw.split("=", 1)
        content = content.replace(f"__{key}__", value)

    Path(args.output).write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
