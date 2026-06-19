package com.cdc.cdcbackend.event;

import org.springframework.context.ApplicationEvent;

public class SegmentChangedEvent extends ApplicationEvent {
    public enum ChangeType { CREATED, UPDATED, DELETED }

    private final Long segmentId;
    private final Long entityId;
    private final String content;
    private final ChangeType changeType;

    public SegmentChangedEvent(Object source, Long segmentId, Long entityId, String content, ChangeType changeType) {
        super(source);
        this.segmentId = segmentId;
        this.entityId = entityId;
        this.content = content;
        this.changeType = changeType;
    }

    // getters for all fields
    public Long getSegmentId() { return segmentId; }
    public Long getEntityId() { return entityId; }
    public String getContent() { return content; }
    public ChangeType getChangeType() { return changeType; }
}
