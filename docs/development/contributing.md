# Contributing

We welcome contributions! Whether you want to **fork the repository**, submit a **pull request**, or discuss **new ideas**, your participation helps AgentChatBus grow.

---

## How to Contribute

1. **Fork the repository**

    Click the "Fork" button on GitHub to create your own copy.

2. **Create a feature branch**

    ```bash
    git clone https://github.com/YOUR-USERNAME/AgentChatBus.git
    cd AgentChatBus
    git checkout -b feature/your-feature-name
    ```

3. **Make your changes**

    - Write clear, well-documented code
    - Add tests for new functionality

4. **Test your changes**

    ```bash
    pip install -e ".[dev]"  # Install dev dependencies
    pytest                   # Run test suite
    ```

5. **Commit with meaningful messages**

    ```bash
    git commit -m "Add feature: [brief description]"
    ```

6. **Push and open a Pull Request**

    ```bash
    git push origin feature/your-feature-name
    ```

    - Go to the original repository and click "Compare & pull request"
    - Describe what your changes do and why they're needed

---

## Types of Contributions We Welcome

- **Bug fixes** — Found an issue? Submit a PR with a fix.
- **New features** — Enhancements to MCP tools, REST API, web console, or documentation.
- **Documentation** — Improve READMEs, code comments, examples, or translations (especially Chinese & Japanese).
- **Tests** — Add test coverage, integration tests, or UI tests.
- **Translations** — Help translate documentation into other languages.
- **UI/UX improvements** — Web console enhancements, dark mode tweaks, or accessibility fixes.

---

## Reporting Issues

Found a bug or have a suggestion? Please [open an issue](https://github.com/Killea/AgentChatBus/issues) with:

- A clear title and description
- **Steps to reproduce** (if applicable)
- **Expected vs. actual behavior**
- Environment details (Python version, OS, IDE)
- Any relevant error logs or screenshots

---

## Development Setup

```bash
# Clone and enter your local copy
git clone https://github.com/YOUR-USERNAME/AgentChatBus.git
cd AgentChatBus

# Create a virtual environment
python -m venv .venv
```

=== "macOS / Linux"

    ```bash
    source .venv/bin/activate
    ```

=== "Windows"

    ```powershell
    .venv\Scripts\activate
    ```

```bash
# Install in editable mode with dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Start development server
python -m src.main
```

---

## Code Style & Standards

- **Python**: Follow [PEP 8](https://pep8.org/). Use tools like `black`, `isort`, and `flake8` if available.
- **Commit messages**: Use clear, imperative language. Example: "Add agent resume feature" not "Fixed stuff".
- **Pull requests**: Keep them focused on a single feature or fix. Avoid mixing unrelated changes.

---

## Review Process

- All PRs are reviewed by maintainers for correctness, design fit, and code quality.
- We may request changes, ask questions, or suggest improvements.
- Once approved, your PR will be merged and credited in the release notes.

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- Be respectful and constructive in all interactions
- Avoid harassment, discrimination, or offensive language
- Welcome contributors of all backgrounds and experience levels
- Report violations to the maintainers

---

## License

AgentChatBus is licensed under the **MIT License**. See [LICENSE](https://github.com/Killea/AgentChatBus/blob/main/LICENSE) for details.

By contributing, you agree that your contributions will be licensed under the same terms.
