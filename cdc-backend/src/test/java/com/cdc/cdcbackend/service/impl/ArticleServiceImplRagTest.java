package com.cdc.cdcbackend.service.impl;

import com.cdc.cdcbackend.entity.WikiEntity;
import com.cdc.cdcbackend.mapper.WikiEntityMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ArticleServiceImplRagTest {

    private WikiEntityMapper entityMapper;
    private ArticleServiceImpl service;

    @BeforeEach
    void setUp() {
        entityMapper = mock(WikiEntityMapper.class);
        service = new ArticleServiceImpl();
        ReflectionTestUtils.setField(service, "wikiEntityMapper", entityMapper);
    }

    @Test
    void resolveEntityReturnsExactOrAliasMatchFirst() {
        WikiEntity influenza = entity(1L, "流行性感冒");
        when(entityMapper.findByName("流感", 1)).thenReturn(influenza);

        WikiEntity result = service.resolveEntity(" 流感 ", 1);

        assertSame(influenza, result);
        verify(entityMapper, never()).fuzzySearch("流感", 1);
    }

    @Test
    void resolveEntityUsesOnlyUniqueFuzzyMatch() {
        WikiEntity influenza = entity(1L, "流行性感冒");
        when(entityMapper.findByName("流行感冒", 1)).thenReturn(null);
        when(entityMapper.fuzzySearch("流行感冒", 1)).thenReturn(List.of(influenza));

        assertSame(influenza, service.resolveEntity("流行感冒", 1));
    }

    @Test
    void resolveEntityReturnsNullForAmbiguousOrMissingEntity() {
        when(entityMapper.findByName("流感疫苗", 2)).thenReturn(null);
        when(entityMapper.fuzzySearch("流感疫苗", 2)).thenReturn(List.of(
            entity(2L, "三价流感疫苗"),
            entity(3L, "四价流感疫苗")
        ));

        assertNull(service.resolveEntity("流感疫苗", 2));
        assertNull(service.resolveEntity("  ", 1));
    }

    private WikiEntity entity(Long id, String name) {
        WikiEntity entity = new WikiEntity();
        entity.setId(id);
        entity.setStdName(name);
        return entity;
    }
}
