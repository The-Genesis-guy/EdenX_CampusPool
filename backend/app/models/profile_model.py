from flask import current_app
from bson.objectid import ObjectId
import datetime
from .. import mongo

class UserProfile:
    """
    Extended user profile information that's collected after initial registration.
    This is shown as a form when users first access their dashboard.
    """
    def __init__(self, user_id, phone_number, emergency_contact=None, 
                 vehicle_details=None, college_id=None):
        self.user_id = ObjectId(user_id)
        self.phone_number = phone_number
        self.emergency_contact = emergency_contact  # For safety
        self.vehicle_details = vehicle_details  # For drivers: bike model, color, plate number
        self.college_id = college_id  # Student ID
        self.is_profile_complete = True
        self.created_at = datetime.datetime.utcnow()
        self.updated_at = datetime.datetime.utcnow()
    
    def save(self):
        """Save profile to database"""
        profile_data = self.__dict__.copy()
        
        # Update the main users collection to mark profile as complete
        mongo.db.users.update_one(
            {"_id": self.user_id},
            {"$set": {"is_profile_complete": True}}
        )
        
        return mongo.db.user_profiles.insert_one(profile_data)
    
    @staticmethod
    def find_by_user_id(user_id):
        """Find profile by user ID"""
        return mongo.db.user_profiles.find_one({"user_id": ObjectId(user_id)})
    
    @staticmethod
    def update_profile(user_id, profile_data):
        """Update existing profile"""
        profile_data["updated_at"] = datetime.datetime.utcnow()
        
        # Also update main users collection
        mongo.db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"is_profile_complete": True}}
        )
        
        return mongo.db.user_profiles.update_one(
            {"user_id": ObjectId(user_id)},
            {"$set": profile_data},
            upsert=True  # Create if doesn't exist
        )