import math

def calculate_haversine_distance(coords1, coords2):
    """
    Calculate the great circle distance between two points on Earth using the Haversine formula.
    This gives us the "as the crow flies" distance, perfect for fare estimation.
    
    Args:
        coords1: [longitude, latitude] of first point
        coords2: [longitude, latitude] of second point
    
    Returns:
        Distance in kilometers (float)
    """
    # Convert coordinates to radians
    lon1, lat1 = math.radians(coords1[0]), math.radians(coords1[1])
    lon2, lat2 = math.radians(coords2[0]), math.radians(coords2[1])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # Radius of Earth in kilometers
    earth_radius_km = 6371.0
    
    distance = earth_radius_km * c
    return distance

def calculate_smart_score(distance_meters, driver_rating, max_distance_m=10000):
    """
    Calculate the Smart Match Score (0-100) combining distance and driver rating.
    This is the "magic formula" that helps riders choose the best driver.
    
    Formula:
    - Distance component (0-60 points): Closer = higher points
    - Rating component (0-40 points): Higher rating = higher points
    
    Args:
        distance_meters: Distance to driver in meters
        driver_rating: Driver's average rating (0-5)
        max_distance_m: Maximum search distance in meters
    
    Returns:
        Smart score (0-100)
    """
    # Distance component (0-60 points)
    # Closer drivers get more points
    distance_score = max(0, 60 - (distance_meters / max_distance_m * 60))
    
    # Rating component (0-40 points) 
    # Higher rated drivers get more points
    rating_score = (driver_rating / 5.0) * 40
    
    # Combine and round
    total_score = distance_score + rating_score
    return min(100, max(0, round(total_score)))

def get_college_coordinates():
    """
    Returns the coordinates of Kristu Jayanti College.
    This is used as a default destination option.
    """
    # Kristu Jayanti College, Bengaluru coordinates
    return [77.7334, 12.8627]  # [longitude, latitude]

def get_college_address():
    """
    Returns the formatted address of Kristu Jayanti College.
    """
    return "Kristu Jayanti College, K Narayanapura, Kothanur, Bengaluru, Karnataka 560077, India"