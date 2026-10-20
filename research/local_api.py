"""Local-only Flask recommendations endpoint for an on-device integration prototype.

Start with: python -m research.local_api
Bind is intentionally fixed to 127.0.0.1. This is not a public or hosted API.
This rule-based endpoint is separate from model training and makes no ML accuracy claim.
"""
from flask import Flask, request, jsonify
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4096

OPTIONS = [
    ("Restful wind-down", "🌙", 20, "Easy", "Fewer than seven hours of sleep can make rest worth prioritising."),
    ("A breathing pause", "🌿", 5, "Easy", "High stress was reported on this check-in."),
    ("A gentle walk", "🚶", 15, "Easy", "Some light movement may add variety to your day."),
    ("A mindful journal", "✍️", 10, "Easy", "Putting feelings into words may help with reflection."),
    ("A little fresh air", "☀️", 10, "Easy", "A change of scenery can make a pleasant reset.")
]

@app.after_request
def disable_cache(response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response

@app.get("/health")
def health():
    return jsonify(status="ok", deployment="local-only", engine="rule-based prototype")

@app.post("/v1/recommendations")
def recommend():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(error="JSON object required"), 400
    try:
        mood, stress = int(body["mood"]), int(body["stress"])
        sleep, exercise = float(body["sleep_hours"]), float(body["exercise_min"])
        if not (1 <= mood <= 5 and 1 <= stress <= 5 and 0 <= sleep <= 24 and 0 <= exercise <= 600):
            raise ValueError()
    except (ValueError, TypeError, KeyError):
        return jsonify(error="Expected mood/stress 1–5, sleep_hours 0–24, exercise_min 0–600"), 400
    scores = [6 if sleep < 7 else 1, 6 if stress >= 4 else 1, 5 if exercise < 20 else 2, 5 if mood <= 2 else 2, 2]
    ranked = sorted(range(len(OPTIONS)), key=lambda i: (-scores[i], i))[:3]
    items = [{"title": OPTIONS[i][0], "icon": OPTIONS[i][1], "minutes": OPTIONS[i][2], "difficulty": OPTIONS[i][3], "reason": OPTIONS[i][4]} for i in ranked]
    return jsonify(activities=items, explanation_type="human-readable rule", disclaimer="Not medical advice")

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5055, debug=False)
