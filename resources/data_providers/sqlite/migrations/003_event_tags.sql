CREATE TABLE IF NOT EXISTS EventTag (
	event_id TEXT NOT NULL,
	name TEXT NOT NULL,
	value TEXT NOT NULL,
	position INTEGER NOT NULL,
	PRIMARY KEY (event_id, position),
	FOREIGN KEY (event_id) REFERENCES Event(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_tag_name_value_event_id ON EventTag(name, value, event_id);
CREATE INDEX IF NOT EXISTS idx_event_tag_event_id_name ON EventTag(event_id, name);

INSERT OR IGNORE INTO EventTag (event_id, name, value, position)
SELECT
	Event.id,
	json_extract(tag.value, '$[0]') AS name,
	json_extract(tag.value, '$[1]') AS value,
	CAST(tag.key AS INTEGER) AS position
FROM Event, json_each(Event.tags) AS tag
WHERE json_type(tag.value) = 'array'
	AND json_array_length(tag.value) >= 2
	AND json_type(tag.value, '$[0]') = 'text'
	AND json_type(tag.value, '$[1]') = 'text';
