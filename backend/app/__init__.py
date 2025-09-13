from flask import Flask, render_template
from flask_pymongo import PyMongo
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from config import Config

mongo = PyMongo()
bcrypt = Bcrypt()
cors = CORS()

def create_app():
    """Application factory function."""
    app = Flask(
        __name__,
        template_folder='../../frontend/templates',
        static_folder='../../frontend/static'
    )
    
    app.config.from_object(Config)

    # Initialize MongoDB only if MONGO_URI is configured
    if app.config.get('MONGO_URI'):
        mongo.init_app(app)
    else:
        print("Warning: MONGO_URI not configured. Database features will be disabled.")
    
    bcrypt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    @app.route('/')
    def index():
        maps_api_key = app.config.get('GOOGLE_MAPS_API_KEY', '')
        return render_template("index.html", maps_api_key=maps_api_key)

    # Register API blueprints
    from .api.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    
    from .api.maps import maps_bp
    app.register_blueprint(maps_bp, url_prefix='/api/maps')

    return app