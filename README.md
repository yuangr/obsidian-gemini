# Gemini Scribe for Obsidian

Gemini Scribe is an Obsidian plugin that integrates Google's Gemini AI models, providing powerful AI-driven assistance for note-taking, writing, and knowledge management directly within Obsidian. It leverages your notes as context for AI interactions, making it a highly personalized and integrated experience.

> **Note:** Pick one of two setup paths in plugin settings → **Provider**:
>
> - **Google Gemini (cloud)** — requires a Gemini API key (free tier available at [Google AI Studio](https://aistudio.google.com/apikey)).
> - **Ollama (local)** — runs locally with no API key; install [Ollama](https://ollama.com), pull a model, and select it in settings. See [docs/guide/ollama-setup.md](docs/guide/ollama-setup.md) for the feature-parity table.

## What's New in v4.9.2 / v4.9.2 新增特性

**⚡ Performance & Cost Optimizations / 性能与成本优化**

- **⚡ Parallel Tool Execution / 并发工具执行** - Independent, non-modifying read and search tools run concurrently in parallel, reducing latency in agent turns. / 独立的只读与搜索类工具支持并发并行执行，缩短 Agent 运行延迟。
- **💾 Context Caching / 上下文前缀缓存** - Automatically caches conversation history prefix for sessions exceeding `32,768` tokens, dramatically reducing token costs and response latency for long chats. / 当长会话超出 32k tokens 时，自动启用 Google 上下文前缀缓存，大幅降低 Token 计费成本并提升响应速度。
- **📂 Files API Uploads / 托管文件 API 上传** - Uploads audio, video, PDF, and image attachments to Google's hosted Files API once per session, avoiding repeated base64 payloads across follow-up turns. Fallbacks to base64 if custom endpoints do not support it. / 会话内多模态文件附件（图片、音视频、PDF 等）仅上传至 Google 托管 Files API 一次，后续对话以 URI 引用，消除 base64 重复传输开销；若自定义中转不支持则平滑回退。

## What's New in v4.9.1

**🔧 Gemini Scribe 4.9.1 - Vault Context Fix**

- **🗂️ Initialize vault context fix** - Fixed the "Initialize vault context" / "Update vault context" button, which was sending a malformed model request and failing to generate AGENTS.md. The feature now works correctly.

**Previous Updates (v4.9.0):**

**🪝 Gemini Scribe 4.9 - Lifecycle Hooks, Stable Prefix Caching, Custom Endpoint**

- **🪝 Lifecycle hooks** - Trigger headless AI agent runs in response to vault events (file created, modified, deleted, renamed). Create and manage hooks from the **Open hook manager** command. See the [Lifecycle Hooks guide](docs/guide/lifecycle-hooks.md).
- **⚡ Stable prefix caching** - The agent's system instruction is now byte-stable across turns and tool follow-ups, restoring Gemini's implicit prefix cache so long sessions stop reprocessing history each turn.
- **🌐 Custom API endpoint** - New setting to route all Gemini API calls through a proxy or alternate endpoint, covering every SDK call site.
- **📐 Collapsible settings sections** - Settings page reorganized into foldable sections for a cleaner UI.
- **🔐 MCP hardening** - Stdio server environment variables now live in Obsidian's encrypted SecretStorage; offline or unreachable MCP servers no longer block plugin load.
- **🛡️ Unified tool-policy** - Sessions, Projects, Scheduled tasks, and Hooks now share one policy model so per-feature permissions behave consistently.
- **📦 Two-phase context compaction** - Long conversations truncate older tool-result payloads first, summarize second, for cleaner handling near the token limit.

**Previous Updates (v4.8.0):**

- **⏰ Scheduled tasks** - Run agent tasks on a cron, time-of-day, or day-of-week schedule with full management UI. See the [Scheduled tasks guide](docs/guide/scheduled-tasks.md).
- **🌙 Missed-run catch-up** - Tasks that should have run while Obsidian was closed surface on startup for review.
- **🛰️ Background tasks** - Deep research and image generation now run in the background with output consolidated under `[state-folder]/Background-Tasks/`. See the [Background tasks guide](docs/guide/background-tasks.md).
- **🦙 Ollama provider** - Point the plugin at a local Ollama server for offline, local-model chat. See the [Ollama Setup guide](docs/guide/ollama-setup.md).
- **🛑 Runaway-loop abort** - Repeated tool-loop detections within a turn now abort the turn with a clear notice instead of churning.
- **🛠️ Headless agent loop** - AgentLoop extracted from the agent view so scheduled and background runners share the same execution engine.

## Features / 功能说明

- **Agent mode with Tool Calling / 智能代理与工具调用:** An AI agent that can actively work with your vault! It can search for files, read content, create new notes, edit existing ones, move and rename files, create folders, and even conduct deep research with proper citations. Features persistent sessions, granular permission controls, session-specific model configuration, and a diff review view that lets you inspect and edit proposed file changes before they're written. / 能够主动在您的 Obsidian 库中工作的 AI 智能代理！它可以搜索文件、读取内容、创建新笔记、编辑现有笔记、移动和重命名文件、创建文件夹，甚至进行带有正确引用的深度研究。支持持久化会话、细粒度权限控制、特定会话的模型配置，以及一个差异审查视图（可以在写入之前检查和编辑建议的文件更改）。
- **Parallel Tool Execution / 并发工具执行 [NEW]**: Execute independent read-only or search tools concurrently (e.g., file reads, search queries) in parallel to significantly reduce latency during multi-step agent runs, while state-modifying tools execute sequentially to avoid write race conditions. / 在多步骤代理运行期间并行执行独立的只读或搜索工具（例如文件读取、搜索查询），以大幅降低延迟。同时状态修改类工具保持顺序执行，避免写入冲突。
- **Context Caching / 上下文前缀缓存 [NEW]**: Automatically cache conversation history prefix using Google's Context Caching when session size exceeds `32,768` tokens, lowering token usage costs and improving response speed for long chat sessions. / 当会话大小超过 `32,768` tokens 时，自动使用 Google Context Caching 缓存历史对话前缀，大幅减少 token 消耗成本并提高长会话响应速度。
- **Files API Uploads / 文件 API 托管 [NEW]**: Securely upload large binary attachments (images, audio, video, PDFs) to Gemini's hosted Files API once per session, referencing them via lightweight URIs in subsequent turns to prevent repeated base64 payload overhead. Supports graceful fallback to base64 inline mode. / 在一次会话中将大型二进制附件（图像、音频、视频、PDF 等）安全地上传至 Gemini 托管的 Files API 一次，后续回合以轻量 URI 引用，避免重复发送 base64 负载的开销。在自定义 API 终结点不支持时可自动回退到 base64 内联模式。
- **Semantic Vault Search / 本地语义搜索:** Search your vault by meaning, not just keywords. Uses Google's File Search API to index your notes in the background. The AI can find relevant content even when you don't remember exact words. Supports PDFs and attachments, with pause/resume controls and detailed status tracking. / 通过含义而非仅仅是关键字搜索您的库。使用 Google 的文件搜索 API 在后台索引您的笔记。即使您不记得确切的字词，AI 也能找到相关内容。支持 PDF 和附件，具有暂停/恢复控制和详细的状态跟踪。
- **Context-Aware Agent / 上下文感知代理:** Add specific notes as persistent context for your agent sessions. The agent can access and reference these context files throughout your conversation, providing highly relevant and personalized responses. / 将特定笔记添加为代理会话的持久上下文。代理可以在整个对话过程中访问和引用这些上下文文件，从而提供高度相关且个性化的回答。
- **Smart Summarization / 智能文档摘要:** Quickly generate concise, one-sentence summaries of your notes and automatically store them in the document's frontmatter, using a dedicated Gemini model optimized for summarization. / 使用专门为摘要优化的 Gemini 模型，快速生成笔记的简明单句摘要，并自动将其存储在文档的 frontmatter 中。
- **Selection-Based AI Features / 基于选中文本的 AI 功能:** Work with selected text in powerful ways (Rewrite, Explain Selection, Ask about selection). / 以强大的方式处理选中的文本（重写、解释选区、询问选区）。
- **IDE-Style Completions / IDE 级代码与文本自动补全:** Get real-time, context-aware text completions as you type, similar to IDEs. Accept completions with `Tab` or dismiss with any other key. This feature uses a dedicated Gemini model for optimized completion generation. / 在您输入时获得实时的、上下文感知的文本补全，类似于 IDE。使用 `Tab` 键接受补全，或使用任何其他键关闭。此功能使用专用的 Gemini 模型来优化补全生成。
- **Persistent Agent sessions / 持久化代理会话:** Store your agent conversation history directly in your vault as markdown files. Each session is stored in the `gemini-scribe/Agent-Sessions/` folder, making it easy to backup, version control, and continue conversations across sessions. / 将您的代理对话历史记录作为 Markdown 文件直接存储在您的库中。每个会话都存储在 `gemini-scribe/Agent-Sessions/` 文件夹中，便于备份、版本控制以及跨会话继续对话。
- **Configurable Models / 可配置的多任务模型:** Choose different Gemini models for chat, summarization, and completions, allowing you to tailor the AI's behavior to each task. / 为聊天、摘要和自动补全选择不同的 Gemini 模型，使您能够根据每项任务定制 AI 的行为。
- **Custom Prompt System / 自定义提示词系统:** Create reusable AI instruction templates for agent sessions, allowing you to customize the AI's behavior for different workflows (e.g., technical documentation, creative writing, research). Includes command palette commands for easy creation and management. / 为代理会话创建可重用的 AI 指令模板，允许您为不同的工作流程（如技术文档、创意写作、研究）自定义 AI 的行为。包括命令面板命令，便于创建和管理。
- **Image Paste Support / 粘贴图片多模态分析:** Paste images directly into the chat input to send them to Gemini for multimodal analysis. Images are automatically saved to your Obsidian attachment folder, displayed as thumbnails before sending, and the AI receives the image path for embedding in notes. / 将图像直接粘贴到聊天输入框中，发送给 Gemini 进行多模态分析。图像会自动保存到您的 Obsidian 附件文件夹中，在发送前显示为缩略图，并且 AI 会接收图像路径以便嵌入在笔记中。
- **MCP Server Support / MCP (Model Context Protocol) 服务支持:** [Experimental] Connect to [Model Context Protocol](https://modelcontextprotocol.io/) servers to extend the agent with external tools. Supports stdio (desktop) and HTTP transports (all platforms including mobile), with OAuth authentication for remote servers. Configure per-tool trust settings with seamless integration into the confirmation flow. / 【实验性】连接到 [Model Context Protocol](https://modelcontextprotocol.io/) 服务器，以使用外部工具扩展代理。支持 stdio（桌面）和 HTTP 传输（所有平台，包括移动端），支持远程服务器的 OAuth 认证。配置每个工具的信任设置，并无缝集成到确认流程中。
- **Scheduled tasks / 自动化定时与周期任务:** Automate recurring AI prompts — daily summaries, weekly reports, periodic vault maintenance — without manual intervention. / 无需人工干预，自动执行循环 AI 提示——每日摘要、每周报告、定期库维护。
- **Lifecycle Hooks / 库事件生命周期钩子:** [Opt-in] Trigger headless AI agent runs in response to vault events — file created, modified, deleted, or renamed. / 【需开启】响应库事件（文件创建、修改、删除或重命名）触发无头 AI 代理运行。
- **Projects / 项目配置隔离:** Scope instructions, permissions, and skills by vault folder structure. / 根据库的文件夹结构，将指令、权限和技能进行项目级别的配置和范围限制。
- **Agent Skills / 代理技能系统:** Create, edit, and run specialized skill packages following the agentskills.io format. / 创建、编辑和运行遵循 agentskills.io 格式的专业技能包。
- **Built-in Prompt templates / 内置提示词模板:** The plugin uses carefully crafted Handlebars templates for system prompts, agent prompts, summarization prompts, selection rewrite prompts, and completion prompts. These ensure consistent and effective AI interaction. / 该插件在系统提示词、代理提示词、摘要提示词、选区重写提示词和补全提示词中使用了精心设计的 Handlebars 模板，以确保一致且有效的 AI 交互。
- **Data Privacy / 数据隐私:** All interactions with the Gemini API are done directly from your machine. No data is sent to any third-party servers other than Google's. Agent session history is stored locally in your Obsidian vault as markdown files. / 与 Gemini API 的所有交互都在您的本地机器上直接完成。除 Google 外，您的数据不会发送到任何第三方服务器。代理会话历史记录存储在您的本地 Obsidian 库中。
- **Robust Session Management / 健壮的会话管理:** Persistent agent sessions that survive restarts, session-specific permissions, context files, and automatic context compaction. / 支持跨 Obsidian 重启的持久化代理会话、会话专属的权限和设置、跨会话持久保存的上下文文件，以及自动上下文压缩。

## Quick Start

1. Install the plugin from Community Plugins
2. Get your free API key from [Google AI Studio](https://aistudio.google.com/apikey)
3. Add the API key in plugin settings
4. Open Agent Chat with the ribbon icon or command palette
5. Manage sessions directly with command palette actions: "New agent session", "Browse agent sessions", "Link project to agent session", and "Agent session settings"
6. Start using the AI agent to work with your vault!

**Prefer running models locally?** Gemini Scribe also supports [Ollama](https://ollama.com) — install Ollama, pull a model with `ollama pull llama3.2`, and switch the **Provider** in settings to "Ollama (local)". A few Gemini-built-in features (Google Search, URL Context, Deep Research, image generation, RAG) are unavailable on Ollama; see [docs/guide/ollama-setup.md](docs/guide/ollama-setup.md) for details.

## Installation

1.  **Community Plugins (Recommended):**
    - Open Obsidian Settings.
    - Navigate to "Community plugins".
    - Ensure "Restricted mode" is OFF.
    - Click "Browse" and search for "Gemini Scribe".
    - Click "Install" and then "Enable".

2.  **Manual Installation:**
    - Download the latest release from the [GitHub Releases](https://github.com/allenhutchison/obsidian-gemini/releases) page (you'll need `main.js`, `manifest.json`, and `styles.css`).
    - Create a folder named `obsidian-gemini` inside your vault's `.obsidian/plugins/` directory.
    - Copy the downloaded files into the `obsidian-gemini` folder.
    - In Obsidian, go to Settings → Community plugins and enable "Gemini Scribe".

## Configuration

1.  **Obtain a Gemini API Key:**
    - Visit the [Google AI Studio](https://aistudio.google.com/apikey).
    - Create a new API key.

2.  **Configure Plugin Settings:**
    - Open Obsidian Settings.
    - Go to "Gemini Scribe" under "Community plugins".
    - **Provider:** Choose `Google Gemini (cloud)` (default) or `Ollama (local)`. The Ollama option exposes a base-URL field and refreshes the model list from `GET /api/tags`.
    - **API Key:** (Gemini only) Paste your Gemini API key here. Your key is stored securely using Obsidian's SecretStorage.
    - **Chat model:** Select the preferred Gemini model for chat interactions (default: `gemini-flash-latest`).
    - **Summary model:** Select the preferred Gemini model for generating summaries (default: `gemini-flash-latest`).
    - **Completion model:** Select the preferred model for IDE-style completions (default: `gemini-flash-lite-latest`).
    - **Summary frontmatter key:** Specify the key to use when storing summaries in the frontmatter (default: `summary`).
    - **Your name:** Enter your name, which the AI will use when addressing you.
    - **Chat History:**
      - **Enable session history:** Toggle whether to save agent session history.
      - **Plugin state folder:** Choose the folder within your vault to store plugin data (agent sessions and custom prompts).
    - **Custom Prompts:**
      - **Allow System Prompt Override:** Allow custom prompts to completely replace the system prompt (use with caution).
    - **UI Settings:**
      - **Enable streaming:** Toggle streaming responses for a more interactive chat experience.
    - **Advanced Settings:** (Click "Show advanced settings" to reveal)
      - **Temperature:** Control AI creativity and randomness (0-2.0, automatically adjusted based on available models).
      - **Top P:** Control response diversity and focus (0-1.0).
      - **Model Discovery:** Gemini models are automatically fetched on startup (cached for 24h); click **Refresh model list** in General settings or run the "Gemini Scribe: Refresh model list" command to fetch a newly-published model immediately. Ollama users can click the same **Refresh model list** button after pulling new models.
      - **API configuration:** Configure retry behavior and backoff delays.
      - **Tool Execution:** Control whether to stop agent execution on tool errors.
      - **Tool loop detection:** Prevent infinite tool execution loops.
      - **Developer Options:** Debug mode, file logging, and advanced configuration tools.

## Usage

### Agent mode

Let the AI actively work with your vault through tool calling capabilities.

**Quick Start:**

1. Open Agent Chat with the command palette or ribbon icon
2. Ask the agent to help with vault operations
3. Review and approve actions (if confirmation is enabled)

**Available Tools:**

- **Search Files by Name:** Find any file by filename patterns (wildcards supported)
- **Search File Contents:** Grep-style text search within note contents (supports regex and case-sensitive search)
- **Read Files:** Access text files or analyze binary files (images, audio, video, PDF) directly through Gemini
- **Create Notes:** Generate new notes with specified content
- **Edit Notes:** Modify existing notes with precision
- **Move/Rename Files:** Reorganize and rename notes in your vault
- **Delete Notes:** Remove notes or folders (with confirmation)
- **Create Folders:** Organize your vault with new folder structures
- **List Files:** Browse vault directories and their contents
- **Web Search:** Search Google for current information (if enabled)
- **Google Maps:** Look up real-world places, addresses, opening hours, and ratings grounded in Google Maps (Gemini provider only)
- **Fetch URLs:** Retrieve and analyze web content
- **Deep Research:** Conduct comprehensive multi-source research with citations
- **Agent Skills:** Activate specialized skill packages for domain-specific tasks

**Key Features:**

- **Persistent Sessions:** Continue conversations across Obsidian restarts
- **Permission Controls:** Choose which tools require confirmation
- **Context Files:** Add specific notes as persistent context
- **Session Configuration:** Override model, temperature, and prompt per session
- **Safety Features:** System folders are protected from modifications
- **Tool permissions**: Granular per-tool permission system with presets (Read only, Cautious, Edit mode, YOLO) and per-tool overrides. Control which tools run automatically, which require confirmation, and which are disabled entirely.
- **Additional Tools**:
  - `update_frontmatter`: Safely modify note properties (status, tags, dates) without rewriting content
  - `append_content`: Efficiently add text to the end of notes (great for logs and journals)

**Example Commands:**

- "Find all notes about project planning"
- "Create a new note summarizing my meeting notes from this week"
- "Research the latest developments in quantum computing and save a report"
- "Analyze my daily notes and identify common themes"
- "Move all completed project notes to an archive folder"
- "Search for information about the Zettelkasten method and create a guide"

### Custom Prompts

Create reusable AI instruction templates to customize behavior for different types of content.

**Quick Start:**

1. Create a prompt file in `[Plugin state folder]/Prompts/`
2. Open the agent panel and click the gear icon in the session header
3. Select your prompt from the "Prompt template" dropdown

**Learn More:** See the comprehensive [Custom Prompts Guide](docs/guide/custom-prompts.md) for detailed instructions, examples, and best practices.

### Documentation

For detailed guides on all features, visit the [Documentation Site](https://allenhutchison.github.io/obsidian-gemini/):

**Core Features:**

- [Agent mode Guide](docs/guide/agent-mode.md) - AI agent with tool-calling capabilities
- [Custom Prompts Guide](docs/guide/custom-prompts.md)
- [AI-Assisted Writing Guide](docs/guide/ai-writing.md)
- [Completions Guide](docs/guide/completions.md)
- [Summarization Guide](docs/guide/summarization.md)
- [Context System Guide](docs/guide/context-system.md)
- [MCP servers Guide](docs/guide/mcp-servers.md) - Connect external tool servers
- [Agent Skills Guide](docs/guide/agent-skills.md) - Create extensible AI skill packages
- [Scheduled tasks Guide](docs/guide/scheduled-tasks.md) - Automate recurring AI prompts
- [Lifecycle Hooks Guide](docs/guide/lifecycle-hooks.md) - Trigger AI runs from vault events

**Configuration & Development:**

- [Settings Reference](docs/reference/settings.md) - Complete settings documentation
- [Advanced Settings Guide](docs/reference/advanced-settings.md)
- [Tool Development Guide](docs/contributing/tool-development.md) - Create custom agent tools

### Chat Interface

1.  **Open Chat:**
    - Use command palette "Gemini Scribe: Open Gemini chat" or click the ribbon icon
    - All chats now have full agent capabilities with tool calling

2.  **Chat with Context:**
    - Type your message in the input box
    - Press **Enter** to send, **Shift+Enter** for new lines (newlines are preserved in the message)
    - The AI automatically includes your current note as context
    - Use **@** to mention files (text, binary, or folders) as persistent context
    - Sessions are automatically saved and can be resumed

3.  **AI responses:**
    - Responses appear in the chat with a "Copy" button
    - Custom prompts modify how the AI responds (if configured)
    - Tool calls and results are shown in collapsible sections for clarity

### Document Summarization

1.  **Open a Note:** Navigate to the Markdown file you want to summarize
2.  **Generate Summary:** Press Ctrl/Cmd + P and run "Gemini Scribe: Summarize active file"
3.  **View Result:** The summary is added to your note's frontmatter (default key: `summary`)

**Tip:** Great for creating quick overviews of long notes or generating descriptions for note indexes.

### Selection-Based Text Rewriting

Precisely rewrite any portion of your text with AI assistance. This feature provides surgical precision for improving specific sections without affecting the rest of your document.

1.  **Select Text:** Highlight the text you want to rewrite in any Markdown file.
2.  **Access Rewrite Options:**
    - **Right-click method:** Right-click the selected text and choose "Gemini Scribe: Rewrite text..."
    - **Command method:** Use the command palette (Ctrl/Cmd + P) and search for "Rewrite text with AI"
3.  **Provide Instructions:** A modal will appear showing your selected text. Enter instructions for how you'd like it rewritten (e.g., "Make this more concise", "Fix grammar", "Make it more formal").
4.  **Review and Apply:** The AI will rewrite only your selected text based on your instructions, maintaining consistency with the surrounding content.

**Examples of rewrite instructions:**

- "Make this more concise"
- "Fix grammar and spelling"
- "Make it more formal/casual"
- "Expand with more detail"
- "Simplify the language"
- "Make it more technical"

**Benefits:**

- **Precise control:** Only rewrites what you select
- **Context-aware:** Maintains consistency with surrounding text and linked documents
- **Safe:** No risk of accidentally modifying your entire document
- **Intuitive:** Natural text editing workflow

### IDE-Style Completions

1.  **Toggle Completions:** Use the command palette (Ctrl/Cmd + P) and select "Gemini Scribe: Toggle completions". A notice will confirm whether completions are enabled or disabled.
2.  **Write:** Begin typing in a Markdown file.
3.  **Suggestions:** After a short pause in typing (750ms), Gemini will provide an inline suggestion based on your current context.
4.  **Accept/Dismiss:**
    - Press `Tab` to accept the suggestion.
    - Press any other key to dismiss the suggestion and continue typing.
5.  **Context-Aware:** Completions consider the surrounding text and document structure for more relevant suggestions.

### Chat History

- **Sessions in your vault:** Agent sessions are stored as markdown files under `[Plugin state folder]/Agent-Sessions/`, making them easy to browse, back up, and version-control.
- **Browse and resume:** Use the session dropdown in the agent panel to load a previous session and continue the conversation.
- **Manual management:** Sessions are plain markdown — delete the files in `Agent-Sessions/` to remove old conversations. There is no in-app "clear all" command.
- **Automatic management:** The plugin automatically:
  - Creates a session file the first time you send a message
  - Adds a YYYY-MM-DD prefix and an AI-generated description to the session title after the first exchange
  - Tracks every file the agent reads or writes in `accessed_files` frontmatter for audit and recall

### Custom Prompts

Create reusable AI instruction templates that customize how the AI behaves for specific sessions.

1. **Create New Prompts:**
   - Use the command palette: "Gemini Scribe: Create new custom prompt"
   - Enter a name and edit the generated template
   - Or manually create `.md` files in `[Plugin state folder]/Prompts/`

2. **Apply to Sessions:**
   - Open the agent panel and click the gear icon in the session header
   - Select your prompt from the "Prompt template" dropdown
   - The prompt applies to all messages in that session

**Tip:** See the comprehensive [Custom Prompts Guide](docs/guide/custom-prompts.md) for examples and best practices.

## Localization

The plugin UI follows **Obsidian's interface language** (Settings → About → Language) — there is no separate plugin language setting. AI responses are generated in your Obsidian language, and the plugin's own UI — settings tabs, modals, the agent panel, command palette entries, and notices — is translated as well.

**Non-English UI text is AI-translated** (bootstrapped with Gemini) and shipped in 20 languages: Czech, Danish, German, Spanish, French, Indonesian, Italian, Japanese, Korean, Dutch, Norwegian, Polish, Portuguese (European and Brazilian), Russian, Turkish, Ukrainian, Vietnamese, and Chinese (Simplified and Traditional). Native speakers: refinement PRs are very welcome — just edit the strings in [`src/i18n/<language>.ts`](src/i18n/). Hand-refined translations are preserved when translations are regenerated; a string is only re-translated when its English source changes.

## Troubleshooting

- **API Key Errors:** Ensure your API key is correct and has the necessary permissions. Get a new key at [Google AI Studio](https://aistudio.google.com/apikey).
- **No Responses:** Check your internet connection and make sure your API key is valid.
- **Slow Responses:** The speed of responses depends on the Gemini model and the complexity of your request. Larger context windows will take longer.
- **Completions Not Showing:**
  - Ensure completions are enabled via the command palette
  - Try typing a few words and pausing to trigger the suggestion
  - Check that you're in a Markdown file
  - Disable other completion plugins that might conflict
- **Sessions Not Loading:** Ensure "Enable session history" is on and the "Plugin state folder" path is correct. Sessions live under `[Plugin state folder]/Agent-Sessions/`.
- **Custom Prompts Not Working:**
  - Verify the prompt file exists in the `[Plugin state folder]/Prompts/` folder
  - Check that the prompt is selected in session settings (gear icon)
  - See the [Custom Prompts Guide](docs/guide/custom-prompts.md) for detailed troubleshooting
- **Parameter/Advanced Settings Issues:**
  - Check if your model supports the temperature range you're using
  - Reset temperature and Top P to defaults if getting unexpected responses
  - Restart Obsidian to trigger a fresh model list fetch (for Gemini), or click **Refresh model list** (for Ollama)
  - See the [Advanced Settings Guide](docs/reference/advanced-settings.md) for detailed configuration help
- **Agent mode / Tool Issues:**
  - Verify your Gemini model supports function calling (all Gemini 2.0+ models do)
  - If tools fail, check file permissions and paths
  - System folders (plugin state folder, .obsidian) are protected from modifications
  - For session issues, try creating a new session from the chat interface
  - Check the console (Ctrl/Cmd + Shift + I) or enable "Log to file" in settings and review `debug.log` in the plugin state folder for detailed error messages
  - Tool loop detection may stop repeated operations - adjust settings if needed

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- Report issues or suggest features on [GitHub](https://github.com/allenhutchison/obsidian-gemini/issues).
- Visit [author's website](https://allen.hutchison.org) for more information.

## Development

Contributions are welcome! See [CLAUDE.md](CLAUDE.md) for development guidelines and architecture details.

```bash
npm install     # Install dependencies
npm run dev     # Development build with watch
npm run build   # Production build
npm test        # Run tests
```

## Credits

Created by Allen Hutchison
