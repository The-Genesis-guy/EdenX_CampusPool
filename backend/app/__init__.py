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

    # -------------------------
    # Frontend Routes
    # -------------------------

    @app.route('/')
    def index():
        maps_api_key = app.config.get('GOOGLE_MAPS_API_KEY', '')
        return render_template("index.html", maps_api_key=maps_api_key)
    
    @app.route("/rider")
    def rider_dashboard():
        maps_api_key = app.config.get('GOOGLE_MAPS_API_KEY', '')
        return render_template("rider_dashboard.html", maps_api_key=maps_api_key)

    @app.route("/driver")
    def driver_dashboard():
        maps_api_key = app.config.get('GOOGLE_MAPS_API_KEY', '')
        return render_template("driver_dashboard.html", maps_api_key=maps_api_key)


    # -------------------------
    # Health Check
    # -------------------------
    @app.route("/health")
    def health_check():
        return {"status": "healthy", "message": "CampusPool API is running"}, 200

    # -------------------------
    # Error Handlers
    # -------------------------
    @app.errorhandler(404)
    def not_found_error(error):
        return {"error": "Resource not found"}, 404

    @app.errorhandler(500)
    def internal_error(error):
        return {"error": "Internal server error"}, 500

    @app.errorhandler(400)
    def bad_request_error(error):
        return {"error": "Bad request"}, 400

    # -------------------------
    # Register API blueprints
    # -------------------------
    from .api.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    
    from .api.maps import maps_bp
    app.register_blueprint(maps_bp, url_prefix='/api/maps')
    
    from .api.rides import rides_bp
    app.register_blueprint(rides_bp, url_prefix='/api/rides')
    
    from .api.profiles import profiles_bp
    app.register_blueprint(profiles_bp, url_prefix='/api/profiles')

    return app
