# Mindreader Sketch

A React sketching interface backed by a FastAPI service and an Ollama vision model. Draw on the canvas, submit the sketch for analysis, and read the streamed response below the form.

## Run with Docker Compose

From the repository root:

```sh
docker compose up --build
```

Compose starts Ollama, downloads the `llava` model if needed, and then starts the backend and frontend. The initial model download can take some time.

Open the app at [http://localhost:5173](http://localhost:5173).

To stop the services:

```sh
docker compose down
```

The Ollama model is stored in the `ollama_data` Docker volume and is retained when the services are stopped.

## How sketch analysis works

1. Choose **Draw sketch** to draw on the canvas or **Upload image** to select an existing sketch. Use **Analyze sketch** to submit and the clear/remove button to start over.
2. The frontend sends the canvas image or uploaded image to the backend as a multipart file.
3. The backend validates and resizes the image, reads the system instructions from `prompts/systemprompt.txt`, and sends the image and instructions to Ollama.
4. The streamed model analysis is displayed below the canvas.

No separate text description is sent with the sketch.

## Services

| Service | URL |
| --- | --- |
| React frontend | http://localhost:5173 |
| FastAPI backend | http://localhost:8000 |
| Ollama API | http://localhost:11434 |

The backend exposes `POST /api/chat` and accepts the sketch as a multipart file upload. OpenAPI/Swagger documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

## Configuration

The Compose configuration sets `LLM_BASE_URL` and `LLM_MODEL` for the backend. The default configured model is `llava`. Change the model in `docker-compose.yml` and the `llm-model-init` pull command together if using a different Ollama vision model.
