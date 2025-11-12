import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

# Import the routers from our other files
from auth import auth_router
from translate import translate_router

# --- App Initialization ---
app = FastAPI(
    title="Translator API",
    description="API for user authentication and translation.",
    version="1.0.0"
)

# --- Mount Static Files ---
# This path '/frontend' matches the volume mount
# we defined in docker-compose.yml
try:
    # We mount this at /static, but it points to the /frontend folder
    app.mount("/static", StaticFiles(directory="/frontend"), name="static")
except RuntimeError:
    print("Could not mount static directory. "
          "Make sure your frontend volume is correctly mounted to '/frontend' in docker-compose.")


# --- Include API Routers ---
# All routes from auth.py will be prefixed with /api
app.include_router(auth_router, prefix="/api")
# All routes from translate.py will be prefixed with /api
app.include_router(translate_router, prefix="/api")


# --- Static Page Routing ---
# We serve the HTML files directly.
# In a real production app, this might be handled by a web server like Nginx.

@app.get("/", response_class=RedirectResponse)
async def get_root():
    """
    Redirects the root URL ('/') to the main login page.
    """
    return RedirectResponse(url="/login.html")

@app.get("/{page_name}.html", response_class=HTMLResponse)
async def get_html_page(page_name: str, request: Request):
    """
    Serves the requested HTML page (login.html, register.html, index.html).
    
    This is a simple way to serve our frontend pages.
    It reads the file from the /frontend directory inside the container.
    """
    # This path '/frontend' matches the volume mount
    # in docker-compose.yml
    file_path = f"/frontend/{page_name}.html"
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(content="<h1>Page not found</h1>", status_code=404)


# --- Server Startup ---
if __name__ == "__main__":
    # This command will start the server when you run 'python main.py'
    # host="0.0.0.0" makes it accessible on your local network
    # reload=True automatically restarts the server when you save changes
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)