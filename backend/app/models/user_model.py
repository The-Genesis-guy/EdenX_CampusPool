from flask import current_app
from bson.objectid import ObjectId
import datetime
from .. import mongo

class User:
    """
    The User model for handling all user-related database operations.
    """
    def __init__(self, name, email, password, home_address_text, coordinates, role, vehicle_type=None, default_seats=None):
        from flask_bcrypt import Bcrypt
        bcrypt = Bcrypt()
        
        self.name = name
        self.email = email
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
        self.home_address_text = home_address_text
        self.homeLocation = {
            "type": "Point",
            "coordinates": coordinates # [longitude, latitude]
        }
        self.averageRating = 0
        self.role = role
        self.vehicleType = vehicle_type
        self.defaultSeats = default_seats
        self.status = "unverified"
        self.registered_on = datetime.datetime.utcnow()
        self.driverStatus = "pending" if role == 'driver' else "not_applicable"

    def save(self):
        """Saves the user to the database."""
        user_data = self.__dict__
        return mongo.db.users.insert_one(user_data)

    @staticmethod
    def find_by_email(email):
        """Finds a user by their email address."""
        return mongo.db.users.find_one({"email": email})
    
    @staticmethod
    def find_by_id(user_id):
        """Finds a user by their ObjectId."""
        return mongo.db.users.find_one({"_id": ObjectId(user_id)})
    
    @staticmethod
    def update_rating(user_id, new_rating):
        """Update user's average rating"""
        try:
            user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
            if not user:
                return False
            
            current_avg = user.get('averageRating', 0)
            total_rides = user.get('totalRides', 0)
            
            if total_rides == 0:
                new_avg = new_rating
                new_total = 1
            else:
                total_rating_points = current_avg * total_rides
                total_rating_points += new_rating
                new_total = total_rides + 1
                new_avg = total_rating_points / new_total
            
            mongo.db.users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"averageRating": round(new_avg, 2), "totalRides": new_total}}
            )
            return True
        except:
            return False