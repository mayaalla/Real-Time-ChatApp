# The Cleanup Decision (Step 11.4)

Decision: Option B (The Tidy Approach)
"Set a storage rule that auto-deletes unused files (in a temp folder) after ~1 day."

Technical Implementation Strategy:
Instead of ignoring orphan files, we will configure our upload flow to initially place files in a `temp/` folder on Cloudinary. We will set up a Cloudinary lifecycle management rule to automatically delete any files in this `temp/` folder that are older than 24 hours. When a user successfully sends a message with an attachment, we will move the file from `temp/` to the permanent `chat/` folder. This ensures no orphan files consume our storage indefinitely.
